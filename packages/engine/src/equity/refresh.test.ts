import { describe, expect, it } from 'vitest';
import type { SessionPhase } from '@hftr/contracts';
import {
  EQUITY_REFRESH_INTERVAL_MS,
  equityRefreshIdempotencyKey,
  equityRefreshWindowKey,
  planEquityRefreshJobs,
  shouldScheduleEquityRefresh,
} from './refresh';

const OPEN_PHASES: SessionPhase[] = ['open', 'midday', 'power_hour'];
const CLOSED_PHASES: SessionPhase[] = ['pre_market', 'overnight', 'closed'];

describe('equity refresh cadence', () => {
  it('buckets now into 15-second windows', () => {
    expect(equityRefreshWindowKey(0)).toBe('0');
    expect(equityRefreshWindowKey(EQUITY_REFRESH_INTERVAL_MS - 1)).toBe('0');
    expect(equityRefreshWindowKey(EQUITY_REFRESH_INTERVAL_MS)).toBe('1');
    expect(equityRefreshWindowKey(45_000)).toBe('3');
  });

  it('shares idempotency keys inside the same window', () => {
    const a = equityRefreshIdempotencyKey('co-1', 10_000);
    const b = equityRefreshIdempotencyKey('co-1', 14_999);
    const c = equityRefreshIdempotencyKey('co-1', 15_000);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toContain('co-1');
  });

  it.each(OPEN_PHASES)('schedules during %s', (phase) => {
    expect(shouldScheduleEquityRefresh(phase)).toBe(true);
  });

  it.each(CLOSED_PHASES)('defers during %s', (phase) => {
    expect(shouldScheduleEquityRefresh(phase)).toBe(false);
  });

  it('plans one job per company when session is open', () => {
    const plans = planEquityRefreshJobs(['a', 'b', 'a'], 'open', 30_000);
    expect(plans).toEqual([
      { companyId: 'a', idempotencyKey: equityRefreshIdempotencyKey('a', 30_000) },
      { companyId: 'b', idempotencyKey: equityRefreshIdempotencyKey('b', 30_000) },
    ]);
  });

  it('returns empty plans when the market is closed', () => {
    expect(planEquityRefreshJobs(['a'], 'closed', 30_000)).toEqual([]);
    expect(planEquityRefreshJobs(['a'], 'overnight', 30_000)).toEqual([]);
  });
});
