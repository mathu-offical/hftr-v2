import { z } from 'zod';
import { enqueueMarketHubAnalyze } from '../posture/enqueue-analyze';
import { registerHandler } from './registry';

/**
 * Scheduled / orchestrated full Analyze (D-183).
 * ET slot schedules enqueue this kind with an explicit phase.
 */
const Payload = z.object({
  companyId: z.string().uuid(),
  phase: z.string().max(40).optional(),
  topicScope: z.string().max(80).optional(),
});

registerHandler('library.market_hub_analyze', async ({ db, clock, job }) => {
  const payload = Payload.parse(job.payload);
  await enqueueMarketHubAnalyze(db, clock, {
    companyId: payload.companyId,
    phase: payload.phase,
    reason: 'schedule',
    forceReseal: true,
  });
});
