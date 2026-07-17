import { describe, expect, it } from 'vitest';
import { percentileMs } from './drain-metrics';

describe('percentileMs', () => {
  it('returns 0 for empty samples', () => {
    expect(percentileMs([], 0.95)).toBe(0);
  });

  it('approximates p95 for small batches', () => {
    const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentileMs(samples, 0.95)).toBe(100);
    expect(percentileMs(samples, 0.5)).toBe(50);
  });
});
