import { getDb } from '@hftr/db';
import { createSystemClock, drainQueues } from '../src/index.ts';

async function main() {
  const db = getDb();
  const clock = createSystemClock();
  console.log('draining POSTURE_RESEARCH…');
  const result = await drainQueues(db, clock, {
    workerId: 'manual-movers-fix',
    budgetMs: 120_000,
    batchSize: 8,
    queueClasses: ['POSTURE_RESEARCH'],
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
