import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DeterministicActionTask, TraceTimelineResponse } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
  actionInstructions,
  actionTraces,
  compileEvents,
  decisionTrees,
  deterministicTasks,
  jobs,
  leadPackages,
  ledgerEntries,
  verificationRecords,
} from '@hftr/db/schema';
import { NotFoundError } from '@hftr/db';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), traceId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; traceId: string }> };

interface Stage {
  stage: 'lead' | 'tree' | 'compile' | 'task' | 'trace' | 'verification' | 'ledger';
  at: string;
  status: string;
  summary: string;
  refId: string;
}

function resolveTraceValueRefs(
  task: typeof deterministicTasks.$inferSelect | undefined,
  instruction: typeof actionInstructions.$inferSelect | undefined,
): z.infer<typeof TraceTimelineResponse>['valueRefs'] {
  if (task?.payload) {
    const parsed = DeterministicActionTask.safeParse(task.payload);
    if (parsed.success) {
      return parsed.data.lineage;
    }
  }
  if (instruction) {
    return {
      quantityRef: instruction.quantityRef,
      limitPriceRef: instruction.limitPriceRef,
      fillTimeoutRef: instruction.fillTimeoutRef,
    };
  }
  return null;
}

/**
 * Full pipeline timeline for one trace: walks task → instruction →
 * compile event → decision tree → lead package upstream, and verification +
 * ledger downstream. Stages the trace never reached are simply absent.
 * Summaries are text-first status strings (counts only, no raw values).
 * `valueRefs` exposes quantity / limit / timeout handles for Values-tab deep links.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, traceId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const trace = (
      await db
        .select()
        .from(actionTraces)
        .where(and(eq(actionTraces.id, traceId), eq(actionTraces.companyId, companyId)))
        .limit(1)
    )[0];
    if (!trace) throw new NotFoundError('trace');

    const timeline: Stage[] = [];

    const task = trace.taskId
      ? (
          await db
            .select()
            .from(deterministicTasks)
            .where(eq(deterministicTasks.id, trace.taskId))
            .limit(1)
        )[0]
      : undefined;

    const instruction = task
      ? (
          await db
            .select()
            .from(actionInstructions)
            .where(
              and(
                eq(actionInstructions.id, task.instructionId),
                eq(actionInstructions.companyId, companyId),
              ),
            )
            .limit(1)
        )[0]
      : undefined;

    const envelope = (instruction?.envelope ?? {}) as { causationRefs?: string[] };
    const causationJobId = envelope.causationRefs?.[0];
    const promotingJob = causationJobId
      ? (await db.select().from(jobs).where(eq(jobs.id, causationJobId)).limit(1))[0]
      : undefined;
    const jobPayload = (promotingJob?.payload ?? {}) as { leadId?: string };

    const lead = jobPayload.leadId
      ? (
          await db
            .select()
            .from(leadPackages)
            .where(
              and(eq(leadPackages.id, jobPayload.leadId), eq(leadPackages.companyId, companyId)),
            )
            .limit(1)
        )[0]
      : undefined;

    const tree = lead
      ? (
          await db
            .select()
            .from(decisionTrees)
            .where(and(eq(decisionTrees.leadId, lead.id), eq(decisionTrees.companyId, companyId)))
            .orderBy(desc(decisionTrees.createdAt))
            .limit(1)
        )[0]
      : undefined;

    const compileEvent = tree
      ? (
          await db
            .select()
            .from(compileEvents)
            .where(and(eq(compileEvents.treeId, tree.id), eq(compileEvents.companyId, companyId)))
            .orderBy(desc(compileEvents.createdAt))
            .limit(1)
        )[0]
      : undefined;

    if (lead) {
      const gates = Array.isArray(lead.gates) ? (lead.gates as { result?: string }[]) : [];
      const passed = gates.filter((g) => g.result === 'pass').length;
      timeline.push({
        stage: 'lead',
        at: lead.createdAt.toISOString(),
        status: lead.status,
        summary: `lead ${lead.status} for ${lead.symbol} (${lead.strategyFamily}): ${passed} of ${gates.length} admission gates passed`,
        refId: lead.id,
      });
    }
    if (tree) {
      const branches = Array.isArray(tree.branches) ? tree.branches.length : 0;
      timeline.push({
        stage: 'tree',
        at: tree.createdAt.toISOString(),
        status: tree.status,
        summary: `decision tree ${tree.status} for ${tree.symbol}: ${branches} branches, source ${tree.sourceClass}`,
        refId: tree.id,
      });
    }
    if (compileEvent) {
      timeline.push({
        stage: 'compile',
        at: compileEvent.createdAt.toISOString(),
        status: compileEvent.result,
        summary:
          compileEvent.result === 'compiled'
            ? 'compile produced an action instruction'
            : `compile blocked: ${compileEvent.blockReason ?? 'unspecified reason'}`,
        refId: compileEvent.id,
      });
    }
    if (task) {
      timeline.push({
        stage: 'task',
        at: task.createdAt.toISOString(),
        status: task.status,
        summary: `deterministic task ${task.status}${task.venueOrderId ? ' with venue order assigned' : ''}`,
        refId: task.id,
      });
    }

    timeline.push({
      stage: 'trace',
      at: trace.createdAt.toISOString(),
      status: trace.outcome,
      summary: `${trace.mode} execution on ${trace.venue}: ${trace.outcome}${trace.failureCode ? ` (${trace.failureCode})` : ''}`,
      refId: trace.id,
    });

    const verifications = await db
      .select()
      .from(verificationRecords)
      .where(eq(verificationRecords.traceId, traceId))
      .orderBy(verificationRecords.createdAt);
    for (const v of verifications) {
      const fields = Array.isArray(v.fieldResults) ? (v.fieldResults as { pass?: boolean }[]) : [];
      const passed = fields.filter((f) => f.pass === true).length;
      timeline.push({
        stage: 'verification',
        at: v.createdAt.toISOString(),
        status: v.result,
        summary: `verification ${v.result}: ${passed} of ${fields.length} field checks passed${v.failureCode ? ` (${v.failureCode})` : ''}`,
        refId: v.id,
      });
    }

    const ledger = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.companyId, companyId), eq(ledgerEntries.traceId, traceId)))
      .orderBy(ledgerEntries.createdAt);
    for (const entry of ledger) {
      timeline.push({
        stage: 'ledger',
        at: entry.createdAt.toISOString(),
        status: entry.kind,
        summary: entry.description,
        refId: entry.id,
      });
    }

    return TraceTimelineResponse.parse({
      timeline,
      valueRefs: resolveTraceValueRefs(task, instruction),
    });
  });
}
