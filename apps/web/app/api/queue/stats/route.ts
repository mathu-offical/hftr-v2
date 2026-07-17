import { queueStats, getLastDrainMetrics } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Authenticated queue depth projection (drives HUD/status readouts). */
export async function GET() {
  return withAuth(async ({ db }) => {
    const rows = await queueStats(db);
    return { stats: rows, lastDrain: getLastDrainMetrics() };
  });
}
