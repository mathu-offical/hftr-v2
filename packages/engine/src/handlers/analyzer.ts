import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { actionTraces, simulationRuns, verificationRecords } from '@hftr/db/schema';
import { registerHandler } from './registry';

const SummarizePayload = z.object({
  companyId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
});

/**
 * Model-free analyzer stub: summarize recent verification + trace outcomes.
 * Writes a short text summary into the simulation run resultSummary.
 */
registerHandler('analyzer.summarize', async ({ db, clock, job }) => {
  const payload = SummarizePayload.parse(job.payload);

  const traces = await db
    .select({
      id: actionTraces.id,
      outcome: actionTraces.outcome,
      failureCode: actionTraces.failureCode,
    })
    .from(actionTraces)
    .where(eq(actionTraces.companyId, payload.companyId))
    .orderBy(desc(actionTraces.createdAt))
    .limit(20);

  const verifications = await db
    .select({
      result: verificationRecords.result,
      failureCode: verificationRecords.failureCode,
    })
    .from(verificationRecords)
    .innerJoin(actionTraces, eq(actionTraces.id, verificationRecords.traceId))
    .where(eq(actionTraces.companyId, payload.companyId))
    .orderBy(desc(verificationRecords.createdAt))
    .limit(20);

  const pass = verifications.filter((v) => v.result === 'pass').length;
  const fail = verifications.filter((v) => v.result === 'fail').length;
  const blocked = verifications.filter((v) => v.result === 'blocked').length;
  const filled = traces.filter((t) => t.outcome === 'filled').length;

  const summaryText =
    `Analyzer stub: ${traces.length} recent traces (${filled} filled). ` +
    `Verification mix: ${pass} pass, ${fail} fail, ${blocked} blocked.`;

  if (payload.runId) {
    const now = new Date(clock.nowMs());
    const [row] = await db
      .select({ resultSummary: simulationRuns.resultSummary })
      .from(simulationRuns)
      .where(
        and(eq(simulationRuns.id, payload.runId), eq(simulationRuns.companyId, payload.companyId)),
      )
      .limit(1);
    const prior =
      typeof row?.resultSummary === 'object' && row.resultSummary !== null
        ? (row.resultSummary as Record<string, unknown>)
        : {};
    await db
      .update(simulationRuns)
      .set({
        resultSummary: {
          ...prior,
          analyzerSummary: summaryText,
          analyzerAt: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(eq(simulationRuns.id, payload.runId));
  }
});
