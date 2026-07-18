import { z } from 'zod';
import {
  enqueuePositionExit,
  scanPositionExitSignals,
} from '../dispatch/position-exits';
import { registerHandler } from './registry';

const PositionExitsPayload = z.object({
  companyId: z.string().uuid(),
});

/**
 * MAINTENANCE queue: model-free position lifecycle exits per company.
 * Scans open holdings, enqueues sell instructions through dispatch.paper_trade.
 */
registerHandler('maintenance.position_exits', async ({ db, clock, job }) => {
  const payload = PositionExitsPayload.parse(job.payload);

  const signals = await scanPositionExitSignals(db, clock, payload.companyId);
  for (const signal of signals) {
    await enqueuePositionExit(db, clock, signal);
  }
});
