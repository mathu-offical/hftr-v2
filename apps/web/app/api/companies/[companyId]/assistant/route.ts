import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import {
  actionTraces,
  assistantMessages,
  jobs,
  ledgerEntries,
  positions,
  trendCandidates,
} from '@hftr/db/schema';
import { createSystemClock, getSyntheticQuote } from '@hftr/engine';
import { parseBody, withAuth, ApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const PostInput = z.object({
  message: z.string().min(1).max(2000),
});

const READ_TOOLS = [
  'company_summary',
  'module_status',
  'recent_executions',
  'positions',
  'trends',
  'queue_status',
] as const;

type ReadTool = (typeof READ_TOOLS)[number];

type ToolResult = {
  tool: ReadTool;
  summary: string;
  data: Record<string, unknown>;
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

function serializeMessage(row: typeof assistantMessages.$inferSelect) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    toolResults: row.toolResults,
    createdAt: row.createdAt.toISOString(),
  };
}

async function runReadTool(
  db: Parameters<typeof scoping.getOwnedCompany>[0],
  clerkUserId: string,
  companyId: string,
  tool: ReadTool,
): Promise<ToolResult> {
  switch (tool) {
    case 'company_summary': {
      const company = await scoping.getOwnedCompany(db, clerkUserId, companyId);
      const moduleRows = await scoping.listModules(db, clerkUserId, companyId);
      const linkRows = await scoping.listLinks(db, clerkUserId, companyId);
      return {
        tool,
        summary: `${company.name} · ${company.mode} · ${moduleRows.length} modules`,
        data: {
          name: company.name,
          mode: company.mode,
          philosophyPrompt: company.philosophyPrompt.slice(0, 500),
          seedCreditsCents: company.seedCreditsCents.toString(),
          moduleCount: moduleRows.length,
          linkCount: linkRows.length,
          createdAt: company.createdAt.toISOString(),
        },
      };
    }
    case 'module_status': {
      const moduleRows = await scoping.listModules(db, clerkUserId, companyId);
      return {
        tool,
        summary: `${moduleRows.length} modules on canvas`,
        data: {
          modules: moduleRows.map((m) => ({
            id: m.id,
            name: m.name,
            type: m.type,
            subtype: m.subtype,
            status: m.status,
            allocationCents: m.allocationCents.toString(),
          })),
        },
      };
    }
    case 'recent_executions': {
      await scoping.getOwnedCompany(db, clerkUserId, companyId);
      const traces = await db
        .select()
        .from(actionTraces)
        .where(eq(actionTraces.companyId, companyId))
        .orderBy(desc(actionTraces.createdAt))
        .limit(10);
      const traceIds = traces.map((t) => t.id);
      const ledgerRows = traceIds.length
        ? await db.select().from(ledgerEntries).where(inArray(ledgerEntries.traceId, traceIds))
        : [];
      const ledgerByTrace = new Map(ledgerRows.map((l) => [l.traceId, l]));
      return {
        tool,
        summary: `${traces.length} recent execution traces`,
        data: {
          executions: traces.map((t) => ({
            id: t.id,
            moduleId: t.moduleId,
            venue: t.venue,
            mode: t.mode,
            outcome: t.outcome,
            failureCode: t.failureCode,
            createdAt: t.createdAt.toISOString(),
            amountCents: ledgerByTrace.get(t.id)?.amountCents?.toString() ?? null,
          })),
        },
      };
    }
    case 'positions': {
      await scoping.getOwnedCompany(db, clerkUserId, companyId);
      const rows = await db
        .select()
        .from(positions)
        .where(eq(positions.companyId, companyId))
        .orderBy(desc(positions.updatedAt))
        .limit(25);
      const clock = createSystemClock();
      return {
        tool,
        summary: `${rows.length} open positions`,
        data: {
          positions: rows.map((p) => {
            const quote = getSyntheticQuote(p.symbol, clock);
            const markCents = quote.lastCents ?? p.avgCostCents;
            const unrealized = p.qty * BigInt(markCents - p.avgCostCents);
            return {
              symbol: p.symbol,
              qty: p.qty.toString(),
              avgCostCents: p.avgCostCents.toString(),
              markCents: markCents.toString(),
              unrealizedPnlCents: unrealized.toString(),
              moduleId: p.moduleId,
            };
          }),
        },
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
        data: {
          trends: rows.map((t) => ({
            id: t.id,
            symbol: t.symbol,
            direction: t.direction,
            strengthBand: t.strengthBand,
            status: t.status,
            moduleId: t.moduleId,
            scannedAt: t.scannedAt.toISOString(),
          })),
        },
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
        data: { stats: rows },
      };
    }
    default: {
      const _exhaustive: never = tool;
      return _exhaustive;
    }
  }
}

function buildAssistantReply(tool: ReadTool | null, result: ToolResult | null): string {
  if (!tool || !result) {
    return (
      'I am a read-only assistant (no model analysis). I can look up: company summary, ' +
      'module status, recent executions, positions, trends, and queue status. ' +
      'Try asking about one of those topics.'
    );
  }
  return (
    `Read-only lookup via ${tool.replace(/_/g, ' ')}: ${result.summary}. ` +
    'This response is deterministic — not model-generated analysis.'
  );
}

function supportedCapabilitiesText(): string {
  return READ_TOOLS.map((t) => t.replace(/_/g, ' ')).join(', ');
}

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

    return { messages: rows.reverse().map(serializeMessage) };
  });
}

/** Persist user message and return a deterministic read-only assistant reply. */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const { message } = await parseBody(req, PostInput);

    const [userRow] = await db
      .insert(assistantMessages)
      .values({
        companyId,
        clerkUserId,
        role: 'user',
        content: message,
      })
      .returning();
    if (!userRow) throw new ApiError(500, 'insert_failed');

    const intent = classifyIntent(message);
    let toolResult: ToolResult | null = null;
    if (intent) {
      try {
        toolResult = await runReadTool(db, clerkUserId, companyId, intent);
      } catch {
        toolResult = null;
      }
    }

    const assistantContent = buildAssistantReply(intent, toolResult);
    const toolResultsPayload = toolResult
      ? [toolResult]
      : [
          {
            tool: 'capabilities' as const,
            summary: supportedCapabilitiesText(),
            data: { tools: READ_TOOLS },
          },
        ];

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

    return {
      userMessage: serializeMessage(userRow),
      assistantMessage: serializeMessage(assistantRow),
    };
  });
}
