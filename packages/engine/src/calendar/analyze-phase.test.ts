import { describe, expect, it } from 'vitest';
import type { SessionInfo } from './calendar';
import {
  resolveAnalyzePhase,
  venueLocalTimeToUtcMs,
  venueMinutesOfDay,
} from './analyze-phase';

function session(opts: {
  openMsUtc: number;
  closeMsUtc: number;
  dayKind?: SessionInfo['dayKind'];
}): SessionInfo {
  return {
    venue: 'XNYS',
    sessionDate: '2026-07-20',
    timezone: 'America/New_York',
    openMsUtc: opts.openMsUtc,
    closeMsUtc: opts.closeMsUtc,
    dayKind: opts.dayKind ?? 'open',
  };
}

/** Fixed ET wall times via known UTC offsets (EDT = UTC-4 in July). */
function etUtc(hour: number, minute = 0): number {
  return Date.UTC(2026, 6, 20, hour + 4, minute, 0);
}

describe('resolveAnalyzePhase (D-183)', () => {
  const open = etUtc(9, 30);
  const close = etUtc(16, 0);
  const s = session({ openMsUtc: open, closeMsUtc: close });

  it('maps overnight and wake_up walls', () => {
    expect(resolveAnalyzePhase(s, etUtc(22, 30))).toBe('overnight');
    expect(resolveAnalyzePhase(s, etUtc(2, 0))).toBe('overnight');
    expect(resolveAnalyzePhase(s, etUtc(5, 0))).toBe('wake_up');
  });

  it('maps pre_market before the open', () => {
    expect(resolveAnalyzePhase(s, etUtc(8, 0))).toBe('pre_market');
  });

  it('maps open_bell then mid_morning', () => {
    expect(resolveAnalyzePhase(s, etUtc(9, 40))).toBe('open_bell');
    expect(resolveAnalyzePhase(s, etUtc(10, 30))).toBe('mid_morning');
  });

  it('maps midday then afternoon across the session', () => {
    expect(resolveAnalyzePhase(s, etUtc(12, 0))).toBe('midday');
    expect(resolveAnalyzePhase(s, etUtc(14, 0))).toBe('afternoon');
  });

  it('maps power_hour then market_close then evening', () => {
    expect(resolveAnalyzePhase(s, etUtc(15, 30))).toBe('power_hour');
    expect(resolveAnalyzePhase(s, etUtc(16, 15))).toBe('market_close');
    expect(resolveAnalyzePhase(s, etUtc(18, 30))).toBe('evening');
  });

  it('computes venue minutes of day', () => {
    expect(venueMinutesOfDay(etUtc(14, 30))).toBe(14 * 60 + 30);
  });

  it('converts venue local civil time to UTC without fixed offset assumption', () => {
    const ms = venueLocalTimeToUtcMs('2026-07-20', 9, 30);
    expect(venueMinutesOfDay(ms)).toBe(9 * 60 + 30);
  });
});
