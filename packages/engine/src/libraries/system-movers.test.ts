import { describe, expect, it } from 'vitest';
import { leakLint } from '../calc/leak-lint';
import { MOVERS_LIBRARY_NAME, MOVERS_PLACEHOLDER_SEEDS, MOVERS_TOPIC_SCOPE } from './system-movers';

describe('system:movers library constants', () => {
  it('uses the system curated shelf scope string', () => {
    expect(MOVERS_TOPIC_SCOPE).toBe('system:movers');
    expect(MOVERS_TOPIC_SCOPE.startsWith('system:')).toBe(true);
  });

  it('names the operator-facing movers shelf', () => {
    expect(MOVERS_LIBRARY_NAME).toBe('Daily movers watch');
  });
});

describe('MOVERS_PLACEHOLDER_SEEDS', () => {
  it('ships three qualitative placeholder concepts', () => {
    expect(MOVERS_PLACEHOLDER_SEEDS).toHaveLength(3);
    const titles = new Set(MOVERS_PLACEHOLDER_SEEDS.map((s) => s.title));
    expect(titles.size).toBe(3);
  });

  it('keeps placeholder bodies leak-lint clean (no digits or clock literals)', () => {
    for (const seed of MOVERS_PLACEHOLDER_SEEDS) {
      const lint = leakLint(seed.body, []);
      expect(lint.ok, `leak on ${seed.title}: ${JSON.stringify(lint.leaks)}`).toBe(true);
      expect(seed.body).not.toMatch(/\d/);
      expect(seed.sourceRef.startsWith('system:movers/')).toBe(true);
    }
  });
});
