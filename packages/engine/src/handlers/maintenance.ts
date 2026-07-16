import { pruneCompleted, sweepExpiredLeases } from '../queue/queue';
import { registerHandler } from './registry';

const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Defensive sweep: reclaim expired leases, prune old completed jobs. */
registerHandler('maintenance.sweep', async ({ db, clock }) => {
  await sweepExpiredLeases(db, clock);
  await pruneCompleted(db, clock, COMPLETED_RETENTION_MS);
});

/** No-op used by queue smoke tests and drain verification. */
registerHandler('maintenance.noop', async () => {
  // intentionally empty
});
