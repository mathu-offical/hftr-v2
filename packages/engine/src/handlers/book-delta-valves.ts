import { z } from 'zod';
import { applyBookDeltaValvesForModule } from '../training/apply-book-delta-valves';
import { registerHandler } from './registry';

const Payload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  minSamples: z.number().int().min(1).max(50).optional(),
});

/**
 * MAINTENANCE: turn unapplied book_delta observations into a bounded
 * participation_rate_band control-snapshot step (D-205). Model-free.
 */
registerHandler('maintenance.book_delta_valves', async ({ db, clock, job }) => {
  const payload = Payload.parse(job.payload);
  const result = await applyBookDeltaValvesForModule(db, clock, {
    companyId: payload.companyId,
    moduleId: payload.moduleId,
    ...(payload.minSamples !== undefined ? { minSamples: payload.minSamples } : {}),
  });
  if (!result.ok && result.reason === 'company_not_found') {
    throw new Error(`book_delta_valves: ${result.reason}`);
  }
  // insufficient / no_step / no_observations are successful no-ops (idempotent).
  return;
});
