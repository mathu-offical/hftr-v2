import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  CompanyLlmPolicy,
  CompileSelectionOutput,
  ConceptBatch,
  ResearchDirective,
  SuggestionThresholdProfile,
  TreeExpandOutput,
  type TemporalOrientation,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { companies, userApiKeys } from '@hftr/db/schema';
import type {
  CompileSelectionInput,
  ModelGateway,
  ResearchSynthesizeInput,
  SuggestionThresholdProposeInput,
  TreeExpandInput,
} from '@hftr/engine';
import { buildOrientation, createSystemClock } from '@hftr/engine';
import { callSchema, jsonSchemaForRef, promptForId, SCHEMA_REFS } from '@hftr/llm';

function orientationFallback(): TemporalOrientation {
  return {
    nowIso: new Date().toISOString(),
    venueTimezone: 'America/New_York',
    sessionPhase: 'closed',
    timeToClose: 'closed',
  };
}

async function loadCompanyPolicy(
  db: Db,
  clerkUserId: string,
  companyId: string,
): Promise<CompanyLlmPolicy> {
  const [company] = await db
    .select({ llmPolicy: companies.llmPolicy })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const [anthropicKey] = await db
    .select({ retentionAttested: userApiKeys.retentionAttested })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, 'anthropic')))
    .limit(1);
  return CompanyLlmPolicy.parse({
    ...(typeof company?.llmPolicy === 'object' && company.llmPolicy !== null
      ? company.llmPolicy
      : {}),
    anthropicZdrAttested:
      anthropicKey?.retentionAttested === 'org_zdr' ||
      Boolean(
        (company?.llmPolicy as { anthropicZdrAttested?: boolean } | null)?.anthropicZdrAttested,
      ),
  });
}

async function loadOrientation(db: Db): Promise<TemporalOrientation> {
  try {
    const clock = createSystemClock();
    return await buildOrientation(db, clock, 'XNYS', 'America/New_York');
  } catch {
    return orientationFallback();
  }
}

async function resolveCompanyOwnerClerkUserId(db: Db, companyId: string): Promise<string | null> {
  const [row] = await db
    .select({ clerkUserId: companies.clerkUserId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return row?.clerkUserId ?? null;
}

/**
 * Cron/worker gateway: resolve the company owner's clerk user id per call so
 * user-saved keys authorize provider traffic without a request session.
 */
export function createOwnerScopedModelGateway(db: Db): ModelGateway {
  const missingOwner = async () =>
    ({ ok: false as const, failure: 'company_owner_missing' }) as const;

  return {
    async synthesizeResearch(input) {
      const ownerId = await resolveCompanyOwnerClerkUserId(db, input.companyId);
      if (!ownerId) return missingOwner();
      return createWebModelGateway(db, ownerId).synthesizeResearch(input);
    },
    async expandTree(input) {
      const ownerId = await resolveCompanyOwnerClerkUserId(db, input.companyId);
      if (!ownerId) return missingOwner();
      return createWebModelGateway(db, ownerId).expandTree(input);
    },
    async compileSelection(input) {
      const ownerId = await resolveCompanyOwnerClerkUserId(db, input.companyId);
      if (!ownerId) return missingOwner();
      return createWebModelGateway(db, ownerId).compileSelection(input);
    },
    async proposeSuggestionThresholds(input) {
      const ownerId = await resolveCompanyOwnerClerkUserId(db, input.companyId);
      if (!ownerId) return missingOwner();
      return createWebModelGateway(db, ownerId).proposeSuggestionThresholds(input);
    },
  };
}

export function createWebModelGateway(db: Db, clerkUserId: string): ModelGateway {
  return {
    async synthesizeResearch(input: ResearchSynthesizeInput) {
      const policy = await loadCompanyPolicy(db, clerkUserId, input.companyId);
      const orientation = await loadOrientation(db);

      const directive = ResearchDirective.parse({
        topicScope: input.topicScope,
        topicSectors: input.topicSectors,
        philosophyAxes: input.philosophyAxes,
        operatorDirectives: input.operatorDirectives ?? [],
        catalogHints: input.catalogHints,
        existingConceptTitles: input.existingConceptTitles,
        evidenceSummaries: input.evidenceSummaries ?? [],
        sealSummaries: input.sealSummaries ?? [],
      });

      const systemPrompt = promptForId('research_synthesize.v1');
      if (!systemPrompt) {
        return { ok: false as const, failure: 'prompt_missing' };
      }

      const jsonSchema = jsonSchemaForRef(SCHEMA_REFS.conceptBatch);
      const idempotencyKey = createHash('sha256')
        .update(
          JSON.stringify({
            tier: 'strategic',
            schema: SCHEMA_REFS.conceptBatch,
            companyId: input.companyId,
            moduleId: input.moduleId,
            directive,
          }),
        )
        .digest('hex')
        .slice(0, 32);

      const outcome = await callSchema({
        db,
        clerkUserId,
        companyPolicy: policy,
        request: {
          tier: 'strategic',
          schemaRef: SCHEMA_REFS.conceptBatch,
          systemPromptId: 'research_synthesize.v1',
          promptVersion: '1',
          input: directive,
          orientation,
          companyId: input.companyId,
          moduleId: input.moduleId,
          jobId: input.jobId,
          idempotencyKey,
        },
        outputSchema: ConceptBatch,
        systemPrompt,
        ...(jsonSchema !== undefined ? { jsonSchema } : {}),
      });

      if (!outcome.ok || outcome.output === null) {
        return { ok: false as const, failure: outcome.failure ?? 'provider_error' };
      }

      const batch = ConceptBatch.parse(outcome.output);
      return { ok: true as const, batch };
    },

    async expandTree(input: TreeExpandInput) {
      const policy = await loadCompanyPolicy(db, clerkUserId, input.companyId);
      const orientation = await loadOrientation(db);

      const directive = {
        leadId: input.leadId,
        symbol: input.symbol,
        direction: input.direction,
        strategyFamily: input.strategyFamily,
        philosophyAxes: input.philosophyAxes,
        sizingBasis: input.sizingBasis,
        freshnessWindow: input.freshnessWindow,
      };

      const systemPrompt = promptForId('tree_expand.v1');
      if (!systemPrompt) {
        return { ok: false as const, failure: 'prompt_missing' };
      }

      const jsonSchema = jsonSchemaForRef(SCHEMA_REFS.treeExpand);
      const idempotencyKey = createHash('sha256')
        .update(
          JSON.stringify({
            tier: 'tactical',
            schema: SCHEMA_REFS.treeExpand,
            companyId: input.companyId,
            moduleId: input.moduleId,
            leadId: input.leadId,
            directive,
          }),
        )
        .digest('hex')
        .slice(0, 32);

      const outcome = await callSchema({
        db,
        clerkUserId,
        companyPolicy: policy,
        request: {
          tier: 'tactical',
          schemaRef: SCHEMA_REFS.treeExpand,
          systemPromptId: 'tree_expand.v1',
          promptVersion: '1',
          input: directive,
          orientation,
          companyId: input.companyId,
          moduleId: input.moduleId,
          jobId: input.jobId,
          idempotencyKey,
        },
        outputSchema: TreeExpandOutput,
        systemPrompt,
        ...(jsonSchema !== undefined ? { jsonSchema } : {}),
      });

      if (!outcome.ok || outcome.output === null) {
        return { ok: false as const, failure: outcome.failure ?? 'provider_error' };
      }

      const output = TreeExpandOutput.parse(outcome.output);
      return { ok: true as const, output };
    },

    async compileSelection(input: CompileSelectionInput) {
      const policy = await loadCompanyPolicy(db, clerkUserId, input.companyId);
      const orientation = await loadOrientation(db);

      const directive = {
        treeId: input.treeId,
        leadId: input.leadId,
        symbol: input.symbol,
        direction: input.direction,
        strategyFamily: input.strategyFamily,
        sizingBasis: input.sizingBasis,
        branchLabels: input.branchLabels,
        recoveryLadderSteps: input.recoveryLadderSteps,
      };

      const systemPrompt = promptForId('compile.v1');
      if (!systemPrompt) {
        return { ok: false as const, failure: 'prompt_missing' };
      }

      const jsonSchema = jsonSchemaForRef(SCHEMA_REFS.compile);
      const idempotencyKey = createHash('sha256')
        .update(
          JSON.stringify({
            tier: 'execution',
            schema: SCHEMA_REFS.compile,
            companyId: input.companyId,
            moduleId: input.moduleId,
            treeId: input.treeId,
            directive,
          }),
        )
        .digest('hex')
        .slice(0, 32);

      const outcome = await callSchema({
        db,
        clerkUserId,
        companyPolicy: policy,
        request: {
          tier: 'execution',
          schemaRef: SCHEMA_REFS.compile,
          systemPromptId: 'compile.v1',
          promptVersion: '1',
          input: directive,
          orientation,
          companyId: input.companyId,
          moduleId: input.moduleId,
          jobId: input.jobId,
          idempotencyKey,
        },
        outputSchema: CompileSelectionOutput,
        systemPrompt,
        ...(jsonSchema !== undefined ? { jsonSchema } : {}),
      });

      if (!outcome.ok || outcome.output === null) {
        return { ok: false as const, failure: outcome.failure ?? 'provider_error' };
      }

      const output = CompileSelectionOutput.parse(outcome.output);
      return { ok: true as const, output };
    },

    async proposeSuggestionThresholds(input: SuggestionThresholdProposeInput) {
      const policy = await loadCompanyPolicy(db, clerkUserId, input.companyId);
      const orientation = await loadOrientation(db);

      const directive = {
        philosophyAxisLabels: input.philosophyAxisLabels,
        libraryLensTitles: input.libraryLensTitles.slice(0, 24),
        sectorFocuses: input.sectorFocuses.slice(0, 12),
        lanePresence: input.lanePresence,
        sessionPhase: input.sessionPhase,
        priorProfileNote: input.priorProfileNote ?? 'none',
      };

      const systemPrompt = promptForId('suggestion_threshold_profile.v1');
      if (!systemPrompt) {
        return { ok: false as const, failure: 'prompt_missing' };
      }

      const jsonSchema = jsonSchemaForRef(SCHEMA_REFS.suggestionThresholdProfile);
      const idempotencyKey = createHash('sha256')
        .update(
          JSON.stringify({
            tier: 'tactical',
            schema: SCHEMA_REFS.suggestionThresholdProfile,
            companyId: input.companyId,
            moduleId: input.moduleId,
            directive,
          }),
        )
        .digest('hex')
        .slice(0, 32);

      const outcome = await callSchema({
        db,
        clerkUserId,
        companyPolicy: policy,
        request: {
          tier: 'tactical',
          schemaRef: SCHEMA_REFS.suggestionThresholdProfile,
          systemPromptId: 'suggestion_threshold_profile.v1',
          promptVersion: '1',
          input: directive,
          orientation,
          companyId: input.companyId,
          moduleId: input.moduleId,
          jobId: input.jobId,
          idempotencyKey,
        },
        outputSchema: SuggestionThresholdProfile,
        systemPrompt,
        ...(jsonSchema !== undefined ? { jsonSchema } : {}),
      });

      if (!outcome.ok || outcome.output === null) {
        return { ok: false as const, failure: outcome.failure ?? 'provider_error' };
      }

      const profile = SuggestionThresholdProfile.parse(outcome.output);
      return { ok: true as const, profile };
    },
  };
}
