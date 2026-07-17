import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { exchangeCalendars } from '../schema/numeric';

/**
 * Seed `exchange_calendars` with XNYS (NYSE/Nasdaq shared hours) sessions.
 * Regular hours 09:30–16:00 America/New_York; half days close 13:00.
 * Holiday lists are maintained here per year and verified by a scheduled
 * job later (verified_at). Run:
 *   pnpm --filter @hftr/db exec tsx src/seed/seed-calendar.ts
 */

const VENUE = 'XNYS';
const TZ = 'America/New_York';
const CATALOG_VERSION = 'xnys_2026_2027_v1';

const HOLIDAYS: Record<string, string[]> = {
  '2026': [
    '2026-01-01', // New Year's Day
    '2026-01-19', // MLK Day
    '2026-02-16', // Washington's Birthday
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day
    '2026-06-19', // Juneteenth
    '2026-07-03', // Independence Day (observed)
    '2026-09-07', // Labor Day
    '2026-11-26', // Thanksgiving
    '2026-12-25', // Christmas
  ],
  '2027': [
    '2027-01-01',
    '2027-01-18',
    '2027-02-15',
    '2027-03-26',
    '2027-05-31',
    '2027-06-18', // Juneteenth (observed)
    '2027-07-05', // Independence Day (observed)
    '2027-09-06',
    '2027-11-25',
    '2027-12-24', // Christmas (observed)
  ],
};

const HALF_DAYS: string[] = [
  '2026-11-27', // day after Thanksgiving
  '2026-12-24', // Christmas Eve
  '2027-11-26',
];

/** Epoch ms for a local wall-clock time in TZ on a given date (DST-safe). */
function zonedTimeToMs(date: string, hour: number, minute: number): number {
  const utcGuess = Date.parse(`${date}T${pad(hour)}:${pad(minute)}:00Z`);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  // Offset between the guess rendered in TZ and the target wall time.
  const parts = Object.fromEntries(fmt.formatToParts(utcGuess).map((p) => [p.type, p.value]));
  const rendered = Date.parse(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:00Z`,
  );
  return utcGuess + (utcGuess - rendered);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function* datesOfYear(year: number): Generator<string> {
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const db = drizzle(neon(url));

  const rows: (typeof exchangeCalendars.$inferInsert)[] = [];
  for (const year of [2026, 2027]) {
    const holidays = new Set(HOLIDAYS[String(year)] ?? []);
    for (const date of datesOfYear(year)) {
      if (isWeekend(date)) continue;
      const isHoliday = holidays.has(date);
      const isHalf = HALF_DAYS.includes(date);
      rows.push({
        venue: VENUE,
        sessionDate: date,
        timezone: TZ,
        openMsUtc: isHoliday ? null : BigInt(zonedTimeToMs(date, 9, 30)),
        closeMsUtc: isHoliday ? null : BigInt(zonedTimeToMs(date, isHalf ? 13 : 16, 0)),
        isHoliday: isHoliday ? 'holiday' : isHalf ? 'half_day' : 'open',
        catalogVersion: CATALOG_VERSION,
      });
    }
  }

  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(exchangeCalendars)
      .values(rows.slice(i, i + 200))
      .onConflictDoNothing();
  }
  console.log(`seeded ${rows.length} ${VENUE} sessions (${CATALOG_VERSION})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
