import { describe, expect, it } from 'vitest';
import { nextConfidenceBand } from './archive';

describe('nextConfidenceBand', () => {
  it('bumps up through low → medium → high', () => {
    expect(nextConfidenceBand('low', 'up')).toBe('medium');
    expect(nextConfidenceBand('medium', 'up')).toBe('high');
    expect(nextConfidenceBand('high', 'up')).toBe('high');
  });

  it('bumps down through high → medium → low', () => {
    expect(nextConfidenceBand('high', 'down')).toBe('medium');
    expect(nextConfidenceBand('medium', 'down')).toBe('low');
    expect(nextConfidenceBand('low', 'down')).toBe('low');
  });

  it('verify advances one band like up', () => {
    expect(nextConfidenceBand('low', 'verify')).toBe('medium');
    expect(nextConfidenceBand('medium', 'verify')).toBe('high');
    expect(nextConfidenceBand('high', 'verify')).toBe('high');
  });
});
