import { and, eq } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { exchangeCalendars } from '@hftr/db/schema';
import { SessionPhase, TemporalOrientation } from '@hftr/contracts';
import type { Clock } from '../clock';

/**
 * Market calendar service (number-handling.md §4c). The only legal source of
 * session opens/closes, holidays, and phase. Backed by `exchange_calendars`
 * (seeded + verified on a schedule); date math happens here, never in models.
 */

export interface SessionInfo {
  venue: string;
  sessionDate: string; // YYYY-MM-DD in venue tz
  timezone: string;
  openMsUtc: number | null;
  closeMsUtc: number | null;
  dayKind: 'open' | 'holiday' | 'half_day';
}

export async function getSession(
  db: Db,
  venue: string,
  sessionDate: string,
): Promise<SessionInfo | null> {
  const rows = await db
    .select()
    .from(exchangeCalendars)
    .where(and(eq(exchangeCalendars.venue, venue), eq(exchangeCalendars.sessionDate, sessionDate)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    venue: row.venue,
    sessionDate: row.sessionDate,
    timezone: row.timezone,
    openMsUtc: row.openMsUtc === null ? null : Number(row.openMsUtc),
    closeMsUtc: row.closeMsUtc === null ? null : Number(row.closeMsUtc),
    dayKind: row.isHoliday,
  };
}

/** Venue-local calendar date for a UTC instant. */
export function venueDate(atMs: number, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(atMs)); // en-CA gives YYYY-MM-DD
}

const POWER_HOUR_MS = 60 * 60 * 1000;
const MIDDAY_START_OFFSET_MS = 2.5 * 60 * 60 * 1000;

export function sessionPhase(session: SessionInfo | null, nowMs: number): SessionPhase {
  if (!session || session.dayKind === 'holiday') return 'closed';
  const { openMsUtc, closeMsUtc } = session;
  if (openMsUtc === null || closeMsUtc === null) return 'closed';
  if (nowMs < openMsUtc) return 'pre_market';
  if (nowMs >= closeMsUtc) return 'overnight';
  if (closeMsUtc - nowMs <= POWER_HOUR_MS) return 'power_hour';
  if (nowMs - openMsUtc <= MIDDAY_START_OFFSET_MS) return 'open';
  return 'midday';
}

export function timeToCloseClass(
  session: SessionInfo | null,
  nowMs: number,
): 'ample' | 'tight' | 'imminent' | 'closed' {
  if (!session || session.closeMsUtc === null || nowMs >= session.closeMsUtc) return 'closed';
  const remaining = session.closeMsUtc - nowMs;
  if (remaining <= 10 * 60 * 1000) return 'imminent';
  if (remaining <= 60 * 60 * 1000) return 'tight';
  return 'ample';
}

/**
 * Build the read-only temporal orientation block prepended to every model
 * call (llm-pipeline.md). This is context the model may echo, never compute.
 */
export async function buildOrientation(
  db: Db,
  clock: Clock,
  venue: string,
  timezone: string,
): Promise<TemporalOrientation> {
  const nowMs = clock.nowMs();
  const session = await getSession(db, venue, venueDate(nowMs, timezone));
  return {
    nowIso: clock.nowIso(),
    venueTimezone: timezone,
    sessionPhase: sessionPhase(session, nowMs),
    timeToClose: timeToCloseClass(session, nowMs),
  };
}
