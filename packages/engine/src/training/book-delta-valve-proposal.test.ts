import { describe, expect, it } from 'vitest';
import {
  outcomeScoreFromBookDeltaObservations,
  proposeBandPositionFromBookDeltas,
} from './book-delta-valve-proposal';

describe('proposeBandPositionFromBookDeltas (D-205)', () => {
  it('fails closed on insufficient samples', () => {
    const r = proposeBandPositionFromBookDeltas({
      observations: [{ fillPriceDeltaBps: 80 }],
      currentPosition: 'typical',
      minSamples: 3,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('insufficient_samples');
  });

  it('steps participation toward min when median abs bps is large', () => {
    const r = proposeBandPositionFromBookDeltas({
      observations: [
        { fillPriceDeltaBps: 60 },
        { fillPriceDeltaBps: -55 },
        { fillPriceDeltaBps: 70 },
      ],
      currentPosition: 'typical',
      minSamples: 3,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.delta.toPosition).toBe('min');
      expect(r.delta.bandId).toBe('participation_rate_band');
      expect(r.outcomeScore).toBeLessThan(0);
    }
  });

  it('steps toward max when fills are tight', () => {
    const r = proposeBandPositionFromBookDeltas({
      observations: [
        { fillPriceDeltaBps: 2 },
        { fillPriceDeltaBps: -1 },
        { fillPriceDeltaBps: 3 },
      ],
      currentPosition: 'typical',
      minSamples: 3,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.delta.toPosition).toBe('max');
  });

  it('uses provider rejects as a negative signal (weekend shadow)', () => {
    const score = outcomeScoreFromBookDeltaObservations([
      { providerReject: true },
      { providerReject: true },
    ]);
    expect(score.outcomeScore).toBe(-0.5);
    const r = proposeBandPositionFromBookDeltas({
      observations: [{ providerReject: true }, { providerReject: true }],
      currentPosition: 'typical',
      minSamples: 2,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.delta.toPosition).toBe('min');
  });

  it('returns no_step when score is neutral', () => {
    const r = proposeBandPositionFromBookDeltas({
      observations: [
        { fillPriceDeltaBps: 10 },
        { fillPriceDeltaBps: 12 },
        { fillPriceDeltaBps: 8 },
      ],
      currentPosition: 'typical',
      minSamples: 3,
    });
    expect(r).toEqual(
      expect.objectContaining({ ok: false, reason: 'no_step' }),
    );
  });
});
