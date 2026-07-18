import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import {
  actionInstructions,
  actionTraces,
  decisionTrees,
  deterministicTasks,
  jobs,
  ledgerEntries,
} from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Executions feed: append-only action traces enriched with ledger money and
 * upstream lead/tree ids (same causation walk as the trace timeline route) so
 * Scenario / Lineage views can join without symbol heuristics.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const traces = await db
      .select()
      .from(actionTraces)
      .where(eq(actionTraces.companyId, companyId))
      .orderBy(desc(actionTraces.createdAt))
      .limit(100);

    const traceIds = traces.map((t) => t.id);
    const ledgerRows = traceIds.length
      ? await db.select().from(ledgerEntries).where(inArray(ledgerEntries.traceId, traceIds))
      : [];
    const ledgerByTrace = new Map(ledgerRows.map((l) => [l.traceId, l]));

    const taskIds = [
      ...new Set(traces.map((t) => t.taskId).filter((id): id is string => typeof id === 'string')),
    ];
    const tasks = taskIds.length
      ? await db.select().from(deterministicTasks).where(inArray(deterministicTasks.id, taskIds))
      : [];
    const taskById = new Map(tasks.map((t) => [t.id, t]));

    const instructionIds = [...new Set(tasks.map((t) => t.instructionId))];
    const instructions = instructionIds.length
      ? await db
          .select()
          .from(actionInstructions)
          .where(
            and(
              eq(actionInstructions.companyId, companyId),
              inArray(actionInstructions.id, instructionIds),
            ),
          )
      : [];
    const instructionById = new Map(instructions.map((i) => [i.id, i]));

    const jobIds = [
      ...new Set(
        instructions
          .map((i) => {
            const envelope = (i.envelope ?? {}) as { causationRefs?: string[] };
            return envelope.causationRefs?.[0];
          })
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    const jobRows = jobIds.length
      ? await db.select().from(jobs).where(inArray(jobs.id, jobIds))
      : [];
    const jobById = new Map(jobRows.map((j) => [j.id, j]));

    const leadIds = [
      ...new Set(
        jobRows
          .map((j) => {
            const payload = (j.payload ?? {}) as { leadId?: string };
            return payload.leadId;
          })
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    const trees = leadIds.length
      ? await db
          .select({
            id: decisionTrees.id,
            leadId: decisionTrees.leadId,
            createdAt: decisionTrees.createdAt,
          })
          .from(decisionTrees)
          .where(
            and(eq(decisionTrees.companyId, companyId), inArray(decisionTrees.leadId, leadIds)),
          )
          .orderBy(desc(decisionTrees.createdAt))
      : [];
    const treeByLead = new Map<string, string>();
    for (const tree of trees) {
      if (!treeByLead.has(tree.leadId)) treeByLead.set(tree.leadId, tree.id);
    }

    function resolveUpstream(taskId: string | null): { leadId: string | null; treeId: string | null } {
      if (!taskId) return { leadId: null, treeId: null };
      const task = taskById.get(taskId);
      if (!task) return { leadId: null, treeId: null };
      const instruction = instructionById.get(task.instructionId);
      if (!instruction) return { leadId: null, treeId: null };
      const envelope = (instruction.envelope ?? {}) as { causationRefs?: string[] };
      const causationJobId = envelope.causationRefs?.[0];
      if (!causationJobId) return { leadId: null, treeId: null };
      const job = jobById.get(causationJobId);
      const leadId = ((job?.payload ?? {}) as { leadId?: string }).leadId ?? null;
      const treeId = leadId ? (treeByLead.get(leadId) ?? null) : null;
      return { leadId, treeId };
    }

    return {
      executions: traces.map((t) => {
        const ledger = ledgerByTrace.get(t.id);
        const upstream = resolveUpstream(t.taskId);
        return {
          id: t.id,
          moduleId: t.moduleId,
          venue: t.venue,
          mode: t.mode,
          outcome: t.outcome,
          failureCode: t.failureCode,
          fills: t.fills,
          createdAt: t.createdAt,
          amountCents: ledger ? ledger.amountCents : null,
          description: ledger ? ledger.description : null,
          leadId: upstream.leadId,
          treeId: upstream.treeId,
        };
      }),
    };
  });
}
