import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AssistantGetResponse,
  AssistantMessage,
  AssistantPostInput,
  AssistantPostResponse,
  AssistantReadTool,
  AssistantToolResultSummary,
  normalizeAssistantToolResultsFromDb,
  parseAssistantToolResultsForPersistence,
} from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
  actionTraces,
  assistantEdits,
  assistantMessages,
  jobs,
  positions,
  trendCandidates,
} from '@hftr/db/schema';
import { createSystemClock } from '@hftr/engine';
import { parseBody, withAuth, ApiError } from '@/lib/api';
import {
  generateAssistantProposal,
  loadCompanyModulesForAssistant,
} from '@/lib/assistant-proposals';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/** Admission cap: user messages per company per rolling minute (deterministic, DB-backed). */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_USER_MESSAGES = 20;

const READ_TOOLS = [
  'company_summary',
  'module_status',
  'recent_executions',
  'positions',
  'trends',
  'queue_status',
] as const satisfies readonly AssistantReadTool[];

type ReadTool = (typeof READ_TOOLS)[number];

type ToolLookupResult = {
  tool: ReadTool;
  summary: string;
};

const INTENT_RULES: Array<{ tool: ReadTool; patterns: RegExp[] }> = [
  {
    tool: 'company_summary',
    patterns: [/\b(company|overview|summary|about|philosophy|seed|mode)\b/],
  },
  { tool: 'module_status', patterns: [/\b(module|modules|canvas)\b/] },
  {
    tool: 'recent_executions',
    patterns: [/\b(execution|executions|trade|trades|trace|traces)\b/],
  },
  { tool: 'positions', patterns: [/\b(position|positions|holding|holdings|portfolio)\b/] },
  { tool: 'trends', patterns: [/\b(trend|trends|candidate|candidates)\b/] },
  { tool: 'queue_status', patterns: [/\b(queue|jobs|pending|background)\b/] },
];

function classifyIntent(message: string): ReadTool | null {
  const lower = message.toLowerCase();
  let best: { tool: ReadTool; score: number } | null = null;
  for (const rule of INTENT_RULES) {
    const score = rule.patterns.filter((p) => p.test(lower)).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { tool: rule.tool, score };
    }
  }
  return best?.tool ?? null;
}

function serializeMessage(row: typeof assistantMessages.$inferSelect): AssistantMessage {
  return AssistantMessage.parse({
    id: row.id,
    role: row.role,
    content: row.content,
    toolResults: normalizeAssistantToolResultsFromDb(row.toolResults),
    createdAt: row.createdAt.toISOString(),
  });
}

function lookupErrorType(err: unknown): string {
  if (err instanceof Error) return err.constructor.name;
  return 'UnknownError';
}

function humanizeTool(tool: ReadTool | string): string {
  return tool.replace(/_/g, ' ');
}

async function assertAssistantRateLimit(
  db: Parameters<typeof scoping.getOwnedCompany>[0],
  clerkUserId: string,
  companyId: string,
): Promise<void> {
  const clock = createSystemClock();
  const windowStart = new Date(clock.nowMs() - RATE_LIMIT_WINDOW_MS);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.companyId, companyId),
        eq(assistantMessages.clerkUserId, clerkUserId),
        eq(assistantMessages.role, 'user'),
        gte(assistantMessages.createdAt, windowStart),
      ),
    );
  if ((row?.count ?? 0) >= RATE_LIMIT_MAX_USER_MESSAGES) {
    throw new ApiError(429, 'assistant_rate_limited');
  }
}

async function runReadTool(
  db: Parameters<typeof scoping.getOwnedCompany>[0],
  clerkUserId: string,
  companyId: string,
  tool: ReadTool,
): Promise<ToolLookupResult> {
  switch (tool) {
    case 'company_summary': {
      const company = await scoping.getOwnedCompany(db, clerkUserId, companyId);
      const moduleRows = await scoping.listModules(db, clerkUserId, companyId);
      return {
        tool,
        summary: `${company.name} · ${company.mode} · ${moduleRows.length} modules`,
      };
    }
    case 'module_status': {
      const moduleRows = await scoping.listModules(db, clerkUserId, companyId);
      return {
        tool,
        summary: `${moduleRows.length} modules on canvas`,
      };
    }
    case 'recent_executions': {
      await scoping.getOwnedCompany(db, clerkUserId, companyId);
      const traces = await db
        .select({ id: actionTraces.id })
        .from(actionTraces)
        .where(eq(actionTraces.companyId, companyId))
        .orderBy(desc(actionTraces.createdAt))
        .limit(10);
      return {
        tool,
        summary: `${traces.length} recent execution traces`,
      };
    }
    case 'positions': {
      await scoping.getOwnedCompany(db, clerkUserId, companyId);
      const rows = await db
        .select({ id: positions.id })
        .from(positions)
        .where(eq(positions.companyId, companyId))
        .orderBy(desc(positions.updatedAt))
        .limit(25);
      return {
        tool,
        summary: `${rows.length} open positions`,
      };
    }
    case 'trends': {
      await scoping.getOwnedCompany(db, clerkUserId, companyId);
      const rows = await db
        .select()
        .from(trendCandidates)
        .where(eq(trendCandidates.companyId, companyId))
        .orderBy(desc(trendCandidates.createdAt))
        .limit(10);
      return {
        tool,
        summary: `${rows.length} trend candidates`,
      };
    }
    case 'queue_status': {
      await scoping.getOwnedCompany(db, clerkUserId, companyId);
      const rows = await db
        .select({
          status: jobs.status,
          queueClass: jobs.queueClass,
          count: sql<number>`count(*)::int`,
        })
        .from(jobs)
        .where(eq(jobs.companyId, companyId))
        .groupBy(jobs.status, jobs.queueClass);
      const pending = rows.filter((r) => r.status === 'pending').reduce((n, r) => n + r.count, 0);
      const active = rows.filter((r) => r.status === 'active').reduce((n, r) => n + r.count, 0);
      return {
        tool,
        summary:
          pending + active === 0
            ? 'No pending or active jobs for this company'
            : `${pending} pending · ${active} active jobs`,
      };
    }
    default: {
      const _exhaustive: never = tool;
      return _exhaustive;
    }
  }
}

function buildAssistantReply(
  intent: ReadTool | null,
  outcome: 'ok' | 'failed' | 'capabilities',
  lookup: ToolLookupResult | null,
  proposalDetail: { tool: string; source: string } | null,
): string {
  if (proposalDetail) {
    return (
      `Proposed ${humanizeTool(proposalDetail.tool)} (${proposalDetail.source}). ` +
      'Review the pending card and confirm before changes apply.'
    );
  }
  if (outcome === 'capabilities' || !intent) {
    return (
      'I can look up company summary, module status, executions, positions, trends, and queue ' +
      'status — or propose bounded canvas edits (create/rename modules, links, watchlists). ' +
      'Try a read query or a write request like "rename module X to Y".'
    );
  }
  if (outcome === 'failed') {
    return (
      `Read-only lookup failed for ${humanizeTool(intent)}. ` +
      'The request was not completed — this is not model-generated analysis.'
    );
  }
  return (
    `Read-only lookup via ${humanizeTool(intent)}: ${lookup?.summary ?? 'completed'}. ` +
    'This response is deterministic — not model-generated analysis.'
  );
}

function supportedCapabilitiesText(): string {
  return READ_TOOLS.map((t) => humanizeTool(t)).join(', ');
}

function buildToolResults(
  intent: ReadTool | null,
  outcome: 'ok' | 'failed' | 'capabilities',
  lookup: ToolLookupResult | null,
): AssistantToolResultSummary[] {
  if (outcome === 'failed' && intent) {
    return parseAssistantToolResultsForPersistence([
      {
        tool: intent,
        summary: `Lookup failed for ${humanizeTool(intent)}. Try again or rephrase.`,
        status: 'failed',
      },
    ]);
  }
  if (outcome === 'ok' && lookup) {
    return parseAssistantToolResultsForPersistence([
      { tool: lookup.tool, summary: lookup.summary, status: 'ok' },
    ]);
  }
  return parseAssistantToolResultsForPersistence([
    { tool: 'capabilities', summary: supportedCapabilitiesText(), status: 'ok' },
  ]);
}

/**
 * Neon HTTP driver (NeonHttpDatabase) does not expose drizzle transactions.
 * User + assistant rows are inserted in one multi-row INSERT (single SQL statement)
 * after lookup completes so partial exchanges are not persisted on assistant insert failure.
 */
/** Company-scoped assistant history (newest 100, returned chronological). */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const rows = await db
      .select()
      .from(assistantMessages)
      .where(
        and(
          eq(assistantMessages.companyId, companyId),
          eq(assistantMessages.clerkUserId, clerkUserId),
        ),
      )
      .orderBy(desc(assistantMessages.createdAt))
      .limit(100);

    const response = AssistantGetResponse.parse({
      messages: rows.reverse().map(serializeMessage),
    });
    return response;
  });
}

/** Persist user message; read lookup and/or write proposals. */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const { message } = await parseBody(req, AssistantPostInput);

    await assertAssistantRateLimit(db, clerkUserId, companyId);

    const [userRow] = await db
      .insert(assistantMessages)
      .values({ companyId, clerkUserId, role: 'user', content: message })
      .returning();
    if (!userRow) throw new ApiError(500, 'insert_failed');

    const moduleDigest = await loadCompanyModulesForAssistant(db, clerkUserId, companyId);
    const generated = await generateAssistantProposal(db, {
      companyId,
      clerkUserId,
      messageId: userRow.id,
      message,
      modules: moduleDigest,
    });

    let proposalDetail: { tool: string; source: string } | null = null;
    if (generated.proposal) {
      await db.insert(assistantEdits).values({
        companyId,
        clerkUserId,
        tool: generated.proposal.tool,
        proposal: generated.proposal,
        status: 'pending',
      });
      proposalDetail = { tool: generated.proposal.tool, source: generated.source };
    }

    const intent = proposalDetail ? null : classifyIntent(message);
    let outcome: 'ok' | 'failed' | 'capabilities' = 'capabilities';
    let lookup: ToolLookupResult | null = null;

    if (!proposalDetail && intent) {
      try {
        lookup = await runReadTool(db, clerkUserId, companyId, intent);
        outcome = 'ok';
      } catch (err) {
        console.error('assistant lookup failed', {
          tool: intent,
          companyId,
          errorType: lookupErrorType(err),
        });
        outcome = 'failed';
      }
    }

    const assistantContent = buildAssistantReply(intent, outcome, lookup, proposalDetail);
    const toolResultsPayload = buildToolResults(intent, outcome, lookup);

    const [assistantRow] = await db
      .insert(assistantMessages)
      .values({
        companyId,
        clerkUserId,
        role: 'assistant',
        content: assistantContent,
        toolResults: toolResultsPayload,
      })
      .returning();
    if (!assistantRow) throw new ApiError(500, 'insert_failed');

    return AssistantPostResponse.parse({
      userMessage: serializeMessage(userRow),
      assistantMessage: serializeMessage(assistantRow),
    });
  });
}
