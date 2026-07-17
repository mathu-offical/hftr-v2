import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  CompanyLlmPolicy,
  ConceptBatch,
  ResearchDirective,
  type TemporalOrientation,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { companies, userApiKeys } from '@hftr/db/schema';
import type { ModelGateway, ResearchSynthesizeInput } from '@hftr/engine';
import { buildOrientation, createSystemClock } from '@hftr/engine';
import { callSchema, promptForId, SCHEMA_REFS } from '@hftr/llm';

function orientationFallback(): TemporalOrientation {
  return {
    nowIso: new Date().toISOString(),
    venueTimezone: 'America/New_York',
    sessionPhase: 'closed',
    timeToClose: 'closed',
  };
}

export function createWebModelGateway(db: Db, clerkUserId: string): ModelGateway {
  return {
    async synthesizeResearch(input: ResearchSynthesizeInput) {
      const [company] = await db
        .select({ llmPolicy: companies.llmPolicy })
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);
      const [anthropicKey] = await db
        .select({ retentionAttested: userApiKeys.retentionAttested })
        .from(userApiKeys)
        .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, 'anthropic')))
        .limit(1);
      const policy = CompanyLlmPolicy.parse({
        ...(typeof company?.llmPolicy === 'object' && company.llmPolicy !== null
          ? company.llmPolicy
          : {}),
        anthropicZdrAttested:
          anthropicKey?.retentionAttested === 'org_zdr' ||
          Boolean(
            (company?.llmPolicy as { anthropicZdrAttested?: boolean } | null)?.anthropicZdrAttested,
          ),
      });

      let orientation: TemporalOrientation;
      try {
        const clock = createSystemClock();
        orientation = await buildOrientation(db, clock, 'XNYS', 'America/New_York');
      } catch {
        orientation = orientationFallback();
      }

      const directive = ResearchDirective.parse({
        topicScope: input.topicScope,
        topicSectors: input.topicSectors,
        philosophyAxes: input.philosophyAxes,
        catalogHints: input.catalogHints,
        existingConceptTitles: input.existingConceptTitles,
      });

      const systemPrompt = promptForId('research_synthesize.v1');
      if (!systemPrompt) {
        return { ok: false as const, failure: 'prompt_missing' };
      }

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
      });

      if (!outcome.ok || outcome.output === null) {
        return { ok: false as const, failure: outcome.failure ?? 'provider_error' };
      }

      const batch = ConceptBatch.parse(outcome.output);
      return { ok: true as const, batch };
    },
  };
}
