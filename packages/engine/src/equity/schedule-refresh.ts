import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { companies } from '@hftr/db/schema';
import type { Clock } from '../clock';
import { getSession, sessionPhase, venueDate } from '../calendar/calendar';
import { enqueue } from '../queue/queue';
import { planEquityRefreshJobs } from '../equity/refresh';

const EQUITY_VENUE = 'XNYS';
const EQUITY_TZ = 'America/New_York';

/**
 * From maintenance.sweep: enqueue one idempotent equity.refresh per active
 * paper company for the current 15s window when the equity venue session is open.
 */
export async function enqueueDueEquityRefreshJobs(db: Db, clock: Clock): Promise<number> {
  const nowMs = clock.nowMs();
  const sessionDate = venueDate(nowMs, EQUITY_TZ);
  const session = await getSession(db, EQUITY_VENUE, sessionDate);
  const phase = sessionPhase(session, nowMs);

  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(isNull(companies.archivedAt), eq(companies.mode, 'paper')));

  const plans = planEquityRefreshJobs(
    rows.map((r) => r.id),
    phase,
    nowMs,
  );

  for (const plan of plans) {
    await enqueue(db, clock, {
      queueClass: 'MAINTENANCE',
      kind: 'equity.refresh',
      payload: { companyId: plan.companyId },
      idempotencyKey: plan.idempotencyKey,
      priority: 'LOW',
      companyId: plan.companyId,
    });
  }
  return plans.length;
}
