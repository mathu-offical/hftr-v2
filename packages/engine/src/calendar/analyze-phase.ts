/**
 * Resolve Market Hub Analyze phase from injectable clock + session (D-181 / D-183).
 * Model-free — never LLM. Uses America/New_York wall clock refined by XNYS open/close.
 */

import type { MarketHubAnalyzePhase } from '@hftr/contracts';
import { MARKET_HUB_ANALYZE_PHASE_META } from '@hftr/contracts';
import type { SessionInfo } from './calendar';

const ET = 'America/New_York';
const OPEN_BELL_MS = 30 * 60 * 1000;
const MID_MORNING_MS = 90 * 60 * 1000;
const POWER_HOUR_MS = 60 * 60 * 1000;
const WAKE_END_ET_MIN = 6 * 60; // 06:00 ET
const EVENING_START_ET_MIN = 17 * 60; // 17:00 ET
const OVERNIGHT_START_ET_MIN = 22 * 60; // 22:00 ET

/** Minutes since local midnight in venue timezone. */
export function venueMinutesOfDay(atMs: number, timezone: string = ET): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(atMs));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/**
 * Convert a venue-local civil time on a venue calendar date to UTC ms.
 * Model-free binary search — never assumes a fixed UTC offset.
 */
export function venueLocalTimeToUtcMs(
  venueDateStr: string,
  hour: number,
  minute: number,
  timezone: string = ET,
): number {
  const wantMin = hour * 60 + minute;
  let lo = Date.parse(`${venueDateStr}T00:00:00.000Z`) - 14 * 60 * 60 * 1000;
  let hi = Date.parse(`${venueDateStr}T00:00:00.000Z`) + 14 * 60 * 60 * 1000;
  while (hi - lo > 500) {
    const mid = Math.floor((lo + hi) / 2);
    const vd = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(mid));
    const vm = venueMinutesOfDay(mid, timezone);
    if (vd < venueDateStr || (vd === venueDateStr && vm < wantMin)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

/**
 * Current-moment analyze slot for operator Analyze button and schedule materialization.
 */
export function resolveAnalyzePhase(
  session: SessionInfo | null,
  nowMs: number,
): MarketHubAnalyzePhase {
  const etMin = venueMinutesOfDay(nowMs, session?.timezone ?? ET);
  const openMs = session?.openMsUtc ?? null;
  const closeMs = session?.closeMsUtc ?? null;
  const holiday = !session || session.dayKind === 'holiday' || openMs === null || closeMs === null;

  // Overnight wall clock (covers late evening through early morning).
  if (etMin >= OVERNIGHT_START_ET_MIN || etMin < WAKE_END_ET_MIN) {
    if (etMin < WAKE_END_ET_MIN && etMin >= 4 * 60) return 'wake_up';
    if (etMin < WAKE_END_ET_MIN) return 'overnight';
    return 'overnight';
  }

  if (holiday) {
    if (etMin >= EVENING_START_ET_MIN) return 'evening';
    if (etMin < 9 * 60 + 30) return 'pre_market';
    return 'evening';
  }

  if (etMin >= EVENING_START_ET_MIN && etMin < OVERNIGHT_START_ET_MIN) return 'evening';

  if (nowMs < openMs) return 'pre_market';

  if (nowMs >= closeMs) {
    if (etMin < EVENING_START_ET_MIN) return 'market_close';
    return 'evening';
  }

  // During RTH — ordered finest windows first.
  if (closeMs - nowMs <= POWER_HOUR_MS) return 'power_hour';
  if (nowMs - openMs <= OPEN_BELL_MS) return 'open_bell';
  if (nowMs - openMs <= MID_MORNING_MS) return 'mid_morning';

  const midSession = openMs + (closeMs - openMs) / 2;
  if (nowMs < midSession) return 'midday';
  return 'afternoon';
}

/** Human label for UI / synthesis dock. */
export function analyzePhaseLabel(phase: MarketHubAnalyzePhase): string {
  return MARKET_HUB_ANALYZE_PHASE_META[phase].label;
}
