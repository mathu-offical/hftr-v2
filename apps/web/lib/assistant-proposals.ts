import { createHash } from 'node:crypto';
import {
  AssistantEditProposal,
  AssistantModelProposalOutput,
  CompanyLlmPolicy,
  ModuleType,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { companies, userApiKeys } from '@hftr/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  ASSISTANT_PROPOSAL_JSON_SCHEMA,
  ASSISTANT_PROPOSAL_SCHEMA_REF,
  ASSISTANT_PROPOSAL_SYSTEM_PROMPT,
  callSchema,
  resolveUserApiKey,
} from '@hftr/llm';
import { scoping } from '@hftr/db';

export interface CompanyDigestModule {
  id: string;
  type: string;
  name: string;
}

export interface ProposalGenerationInput {
  companyId: string;
  clerkUserId: string;
  messageId: string;
  message: string;
  modules: CompanyDigestModule[];
}

export interface ProposalGenerationResult {
  proposal: AssistantEditProposal | null;
  source: 'model' | 'heuristic' | 'none';
  detail: string;
}

const WRITE_INTENT =
  /\b(create|add|rename|link|allocate|transfer|move|fund|watchlist|watch|trigger|scan|curate|policy|patch|update|config)\b/i;

function looksLikeWriteRequest(message: string): boolean {
  return WRITE_INTENT.test(message);
}

/** Deterministic rename: "rename module X to Y" or "rename X to Y". */
function heuristicRename(
  message: string,
  modules: CompanyDigestModule[],
): AssistantEditProposal | null {
  const match = message.match(/\brename\s+(?:module\s+)?(.+?)\s+to\s+(.+?)\s*$/i);
  if (!match) return null;
  const fromLabel = match[1]!.trim().toLowerCase();
  const newName = match[2]!.trim();
  if (!newName) return null;
  const mod =
    modules.find((m) => m.name.toLowerCase() === fromLabel) ??
    modules.find((m) => m.name.toLowerCase().includes(fromLabel));
  if (!mod || mod.type === 'math') return null;
  return { tool: 'rename_module', moduleId: mod.id, name: newName.slice(0, 120) };
}

/** Deterministic create: "create/add a <type> module named X". */
function heuristicCreateModule(message: string): AssistantEditProposal | null {
  const match = message.match(
    /\b(?:create|add)\s+(?:a\s+)?(?:(research|library|trend|trading|policy|analyzer|simulator)\s+)?module(?:\s+named|\s+called)?\s+(.+?)\s*$/i,
  );
  if (!match) return null;
  const typeRaw = (match[1] ?? 'research').toLowerCase();
  const name = match[2]!.trim().slice(0, 80);
  if (!name) return null;
  const parsedType = ModuleType.safeParse(typeRaw);
  if (!parsedType.success) return null;
  const type = parsedType.data;
  const defaultConfig: Partial<Record<ModuleType, Record<string, unknown>>> = {
    research: {
      topicScope: 'general',
      researchSubtype: 'external_web',
      curiosity: 'balanced',
      cadenceMinutes: 180,
    },
    librarian: {
      topicScope: 'general',
      librarianSubtype: 'librarian_relevance',
      cadenceMinutes: 360,
    },
    library: { topicScope: 'general', libraryClass: 'topic_runtime' },
    trend: {
      focus: 'market scan',
      trendPosture: 'session_intraday',
      maxActiveTrends: 10,
      cadenceMinutes: 30,
    },
    trading: { subtype: 'day', strategyFamilies: [], exitTimelineDays: 1, cadenceMinutes: 5 },
    policy: { policyEnvelopeRef: 'paper_balanced_general_v1', notes: '' },
    math: { mathType: 'company_hub' },
    analyzer: {},
    simulator: {},
  };
  return {
    tool: 'create_module',
    type,
    name,
    config: defaultConfig[type] ?? {},
    canvasPosition: { x: 120, y: 120 },
  };
}

/** Link modules: "link <from> to <to>" with optional data feed hint. */
function heuristicLinkModules(
  message: string,
  modules: CompanyDigestModule[],
): AssistantEditProposal | null {
  const match = message.match(/\blink\s+(.+?)\s+to\s+(.+?)(?:\s+with\s+data\s+feed)?\s*$/i);
  if (!match) return null;
  const from = modules.find((m) => m.name.toLowerCase().includes(match[1]!.trim().toLowerCase()));
  const to = modules.find((m) => m.name.toLowerCase().includes(match[2]!.trim().toLowerCase()));
  if (!from || !to || from.id === to.id) return null;
  return {
    tool: 'link_modules',
    fromModuleId: from.id,
    toModuleId: to.id,
    linkKind: 'data_feed',
  };
}

function runHeuristics(
  message: string,
  modules: CompanyDigestModule[],
): AssistantEditProposal | null {
  return (
    heuristicRename(message, modules) ??
    heuristicCreateModule(message) ??
    heuristicLinkModules(message, modules)
  );
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

async function tryModelProposal(
  db: Db,
  input: ProposalGenerationInput,
): Promise<AssistantEditProposal | null> {
  const mistralKey = await resolveUserApiKey(db, input.clerkUserId, 'mistral');
  const cerebrasKey = await resolveUserApiKey(db, input.clerkUserId, 'cerebras');
  if (!mistralKey && !cerebrasKey) return null;

  const policy = await loadCompanyPolicy(db, input.clerkUserId, input.companyId);
  const digest = {
    messageId: input.messageId,
    userMessage: input.message,
    modules: input.modules.map((m) => ({ id: m.id, type: m.type, name: m.name })),
  };
  const idempotencyKey = createHash('sha256')
    .update(JSON.stringify({ tier: 'tactical', schema: ASSISTANT_PROPOSAL_SCHEMA_REF, digest }))
    .digest('hex')
    .slice(0, 32);

  const outcome = await callSchema({
    db,
    clerkUserId: input.clerkUserId,
    companyPolicy: policy,
    request: {
      tier: 'tactical',
      schemaRef: ASSISTANT_PROPOSAL_SCHEMA_REF,
      systemPromptId: 'assistant_proposal.v1',
      promptVersion: '1',
      input: digest,
      orientation: {
        nowIso: new Date().toISOString(),
        venueTimezone: 'America/New_York',
        sessionPhase: 'closed',
        timeToClose: 'closed',
      },
      companyId: input.companyId,
      moduleId: null,
      jobId: null,
      idempotencyKey,
    },
    outputSchema: AssistantModelProposalOutput,
    systemPrompt: ASSISTANT_PROPOSAL_SYSTEM_PROMPT,
    jsonSchema: ASSISTANT_PROPOSAL_JSON_SCHEMA as Record<string, unknown>,
    leakWhitelist: ['amountFrom'],
  });

  if (!outcome.ok || outcome.output === null) return null;
  const parsed = AssistantModelProposalOutput.parse(outcome.output);
  if (!parsed.proposal) return null;

  const proposal = AssistantEditProposal.parse(parsed.proposal);
  if (proposal.tool === 'allocate_funds' && proposal.amountFrom) {
    return {
      ...proposal,
      amountFrom: {
        ...proposal.amountFrom,
        messageId: input.messageId,
      },
    };
  }
  return proposal;
}

/**
 * Produce a pending assistant edit proposal from chat (model path with heuristic fallback).
 */
export async function generateAssistantProposal(
  db: Db,
  input: ProposalGenerationInput,
): Promise<ProposalGenerationResult> {
  if (!looksLikeWriteRequest(input.message)) {
    return { proposal: null, source: 'none', detail: 'not_a_write_request' };
  }

  try {
    const modelProposal = await tryModelProposal(db, input);
    if (modelProposal) {
      return { proposal: modelProposal, source: 'model', detail: 'mistral_proposal' };
    }
  } catch {
    // fall through to heuristics
  }

  const heuristic = runHeuristics(input.message, input.modules);
  if (heuristic) {
    return { proposal: heuristic, source: 'heuristic', detail: 'deterministic_intent' };
  }

  return { proposal: null, source: 'none', detail: 'no_matching_heuristic' };
}

export async function loadCompanyModulesForAssistant(
  db: Db,
  clerkUserId: string,
  companyId: string,
): Promise<CompanyDigestModule[]> {
  const rows = await scoping.listModules(db, clerkUserId, companyId);
  return rows.map((m) => ({ id: m.id, type: m.type, name: m.name }));
}
