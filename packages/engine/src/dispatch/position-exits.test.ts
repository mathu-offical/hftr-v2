import { describe, expect, it } from 'vitest';
import {
  resolvePositionExitReason,
  shouldExitBreakeven,
  shouldExitTargetDeadline,
  shouldExitTimeStop,
} from './position-exits';

describe('shouldExitBreakeven', () => {
  it('returns false at or just below avg cost within spread buffer', () => {
    expect(shouldExitBreakeven(10_000, 10_000)).toBe(false);
    expect(shouldExitBreakeven(10_000, 9_999)).toBe(false);
  });

  it('returns true when mark is below avg cost beyond the buffer', () => {
    // 15 bps of 10000 → floor 9985
    expect(shouldExitBreakeven(10_000, 9_985)).toBe(true);
    expect(shouldExitBreakeven(10_000, 9_900)).toBe(true);
  });

  it('returns false when mark is above average cost', () => {
    expect(shouldExitBreakeven(10_000, 10_001)).toBe(false);
  });

  it('respects an explicit bufferBps', () => {
    expect(shouldExitBreakeven(10_000, 9_990, 0)).toBe(true);
    expect(shouldExitBreakeven(10_000, 9_990, 20)).toBe(false);
  });
});

describe('shouldExitTimeStop', () => {
  const openedAtMs = 1_750_000_000_000;

  it('returns false before the typical hold horizon', () => {
    expect(shouldExitTimeStop(openedAtMs, openedAtMs + 59 * 60_000)).toBe(false);
  });

  it('returns true at the 60-minute typical horizon', () => {
    expect(shouldExitTimeStop(openedAtMs, openedAtMs + 60 * 60_000)).toBe(true);
  });

  it('respects a custom holdMinutesTypical', () => {
    expect(shouldExitTimeStop(openedAtMs, openedAtMs + 30 * 60_000, 30)).toBe(true);
  });
});

describe('shouldExitTargetDeadline', () => {
  it('returns true when now is at or past the deadline', () => {
    expect(shouldExitTargetDeadline(1_000, 1_000)).toBe(true);
    expect(shouldExitTargetDeadline(1_000, 1_001)).toBe(true);
  });

  it('returns false before the deadline', () => {
    expect(shouldExitTargetDeadline(1_000, 999)).toBe(false);
  });
});

describe('resolvePositionExitReason', () => {
  const base = {
    avgCostCents: 10_000,
    markCents: 10_500,
    targetExitMs: null as number | null,
    openedAtMs: 1_750_000_000_000,
    nowMs: 1_750_000_000_000,
  };

  it('prefers target_exit_deadline over breakeven', () => {
    expect(
      resolvePositionExitReason({
        ...base,
        markCents: 9_500,
        targetExitMs: 1_750_000_000_000,
        nowMs: 1_750_000_000_000,
      }),
    ).toBe('target_exit_deadline');
  });

  it('returns breakeven when mark is below cost beyond the buffer', () => {
    expect(resolvePositionExitReason({ ...base, markCents: 9_900 })).toBe('breakeven');
  });

  it('does not treat flat post-fill mark as breakeven', () => {
    expect(resolvePositionExitReason({ ...base, markCents: 10_000 })).toBeNull();
  });

  it('returns time_stop when only the horizon stub fires', () => {
    expect(
      resolvePositionExitReason({
        ...base,
        nowMs: base.openedAtMs + 61 * 60_000,
      }),
    ).toBe('time_stop');
  });

  it('skips time_stop when disabled', () => {
    expect(
      resolvePositionExitReason({
        ...base,
        nowMs: base.openedAtMs + 61 * 60_000,
        timeStopEnabled: false,
      }),
    ).toBeNull();
  });

  it('returns null when quote mark is missing', () => {
    expect(resolvePositionExitReason({ ...base, markCents: null })).toBeNull();
  });
});
