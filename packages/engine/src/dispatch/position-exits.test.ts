import { describe, expect, it } from 'vitest';
import { getRrTargetLadder, getTimeStopTypicalMinutes } from '../pipeline/bands';
import {
  measurableGainFloorCents,
  recoveryPhaseForExit,
  resolvePositionExitReason,
  riskDistanceCents,
  scaleOutQty,
  shouldExitAtrStop,
  shouldExitBreakeven,
  shouldExitMeasurableGain,
  shouldExitSessionClose,
  shouldExitTargetDeadline,
  shouldExitTimeStop,
  shouldHitRrMultiple,
  syntheticAtrCents,
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
  const typical = getTimeStopTypicalMinutes();

  it('returns false before the catalog typical hold horizon', () => {
    expect(shouldExitTimeStop(openedAtMs, openedAtMs + (typical - 1) * 60_000)).toBe(false);
  });

  it('returns true at the catalog typical horizon', () => {
    expect(shouldExitTimeStop(openedAtMs, openedAtMs + typical * 60_000)).toBe(true);
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

describe('measurable gain', () => {
  it('floor covers synthetic round-trip plus net gain bps', () => {
    // halfSpread=2, roundTrip=4, net 25bps=25 → 29
    expect(measurableGainFloorCents(10_000)).toBe(29);
  });

  it('shouldExitMeasurableGain requires clearing the floor', () => {
    expect(shouldExitMeasurableGain(10_000, 10_028)).toBe(false);
    expect(shouldExitMeasurableGain(10_000, 10_029)).toBe(true);
  });
});

describe('shouldExitSessionClose', () => {
  it('fires when cash session is closed and position opened in open hours', () => {
    expect(shouldExitSessionClose('overnight', { openedDuringOpenSession: true })).toBe(true);
    expect(shouldExitSessionClose('closed', { openedDuringOpenSession: true })).toBe(true);
  });

  it('skips when position opened while already closed (weekend paper)', () => {
    expect(shouldExitSessionClose('overnight', { openedDuringOpenSession: false })).toBe(false);
  });

  it('does not fire during open cash hours', () => {
    expect(shouldExitSessionClose('midday')).toBe(false);
  });
});

describe('ATR / RR helpers', () => {
  it('syntheticAtrCents is 50 bps of mark floored at 1', () => {
    expect(syntheticAtrCents(10_000)).toBe(50);
    expect(syntheticAtrCents(1)).toBe(1);
  });

  it('shouldExitAtrStop fires at or below entry − R', () => {
    expect(shouldExitAtrStop(10_000, 9_880, 120)).toBe(true);
    expect(shouldExitAtrStop(10_000, 9_881, 120)).toBe(false);
  });

  it('shouldHitRrMultiple fires at entry + R×multiple', () => {
    expect(shouldHitRrMultiple(10_000, 10_120, 120, 1)).toBe(true);
    expect(shouldHitRrMultiple(10_000, 10_119, 120, 1)).toBe(false);
    expect(shouldHitRrMultiple(10_000, 10_240, 120, 2)).toBe(true);
  });

  it('scaleOutQty leaves a remainder when qty > 1', () => {
    expect(scaleOutQty(10n, 50)).toBe(5n);
    expect(scaleOutQty(1n, 50)).toBe(1n);
  });

  it('riskDistanceCents uses atr × multiplier', () => {
    expect(riskDistanceCents(50, 2.25)).toBe(112);
  });
});

describe('catalog band loaders', () => {
  it('loads rr_target_ladder from seeded catalog', () => {
    const ladder = getRrTargetLadder();
    expect(ladder.tp1R).toBe(1);
    expect(ladder.tp1ScalePct).toBe(50);
    expect(ladder.tp2R).toBe(2);
    expect(ladder.breakevenOnTp1).toBe(true);
  });

  it('loads time_stop typical minutes from catalog', () => {
    expect(getTimeStopTypicalMinutes()).toBe(60);
  });
});

describe('resolvePositionExitReason', () => {
  const base = {
    avgCostCents: 10_000,
    markCents: 10_000,
    targetExitMs: null as number | null,
    openedAtMs: 1_750_000_000_000,
    nowMs: 1_750_000_000_000,
    catalogExitsEnabled: false,
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

  it('prefers atr_stop over breakeven when catalog exits enabled', () => {
    // atr~50, mult 2.25 → R=112; stop at 9888
    expect(
      resolvePositionExitReason({
        ...base,
        catalogExitsEnabled: true,
        markCents: 9_800,
        atrMultiplier: 2.25,
      }),
    ).toBe('atr_stop');
  });

  it('returns measurable_gain_take before session_close when gain clears floor', () => {
    expect(
      resolvePositionExitReason({
        ...base,
        catalogExitsEnabled: true,
        markCents: 10_029,
        atrMultiplier: 2.25,
        sessionPhase: 'overnight',
        openedDuringOpenSession: true,
      }),
    ).toBe('measurable_gain_take');
  });

  it('returns rr_tp1_scale_out at +1R (above measurable floor)', () => {
    expect(
      resolvePositionExitReason({
        ...base,
        catalogExitsEnabled: true,
        markCents: 10_120,
        atrMultiplier: 2.25,
      }),
    ).toBe('rr_tp1_scale_out');
  });

  it('returns rr_tp2_scale_out at +2R', () => {
    expect(
      resolvePositionExitReason({
        ...base,
        catalogExitsEnabled: true,
        markCents: 10_240,
        atrMultiplier: 2.25,
      }),
    ).toBe('rr_tp2_scale_out');
  });

  it('returns rr_tp3_exit at +3R', () => {
    expect(
      resolvePositionExitReason({
        ...base,
        catalogExitsEnabled: true,
        markCents: 10_360,
        atrMultiplier: 2.25,
      }),
    ).toBe('rr_tp3_exit');
  });

  it('returns session_close when cash session is closed and opened in open hours', () => {
    expect(
      resolvePositionExitReason({
        ...base,
        catalogExitsEnabled: true,
        sessionPhase: 'overnight',
        openedDuringOpenSession: true,
      }),
    ).toBe('session_close');
  });

  it('skips session_close for positions opened while already closed', () => {
    expect(
      resolvePositionExitReason({
        ...base,
        catalogExitsEnabled: true,
        sessionPhase: 'overnight',
        openedDuringOpenSession: false,
      }),
    ).toBeNull();
  });

  it('does not session_close during open cash hours', () => {
    expect(
      resolvePositionExitReason({
        ...base,
        catalogExitsEnabled: true,
        sessionPhase: 'midday',
      }),
    ).toBeNull();
  });
});

describe('recoveryPhaseForExit', () => {
  it('maps stop/scale reasons to recovery ladder verbs', () => {
    expect(recoveryPhaseForExit('atr_stop')).toBe('escalate_or_abort');
    expect(recoveryPhaseForExit('rr_tp1_scale_out')).toBe('constrain');
    expect(recoveryPhaseForExit('measurable_gain_take')).toBe('constrain');
    expect(recoveryPhaseForExit('time_stop')).toBe('observe');
  });
});
