import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { simulationRuns } from '@hftr/db/schema';
import { registerHandler } from './registry';

const RunPayload = z.object({
  companyId: z.string().uuid(),
  runId: z.string().uuid(),
});

const DETERMINISTIC_RESULT_SUMMARY = {
  schemaVersion: 1,
  fillCount: 0,
  note: 'deterministic_stub_v1',
  provenance: 'paper_sim',
} as const;

/**
 * Deterministic paper simulation completion (VERIFY queue).
 * Transitions pending/running → completed with a stub result summary until
 * the full simulator module ships. Idempotent when already completed.
 */
registerHandler('simulation.run', async ({ db, clock, job }) => {
  const payload = RunPayload.parse(job.payload);
  const [row] = await db
    .select()
    .from(simulationRuns)
    .where(
      and(eq(simulationRuns.id, payload.runId), eq(simulationRuns.companyId, payload.companyId)),
    )
    .limit(1);

  if (!row) {
    throw new Error(`simulation_run_not_found:${payload.runId}`);
  }

  if (row.status === 'completed') {
    return;
  }

  const now = new Date(clock.nowMs());

  await db
    .update(simulationRuns)
    .set({ status: 'running', updatedAt: now })
    .where(eq(simulationRuns.id, payload.runId));

  await db
    .update(simulationRuns)
    .set({
      status: 'completed',
      resultSummary: { ...DETERMINISTIC_RESULT_SUMMARY },
      updatedAt: now,
    })
    .where(eq(simulationRuns.id, payload.runId));
});
