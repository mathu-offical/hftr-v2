import { describe, expect, it } from 'vitest';
import { leakLint } from '../calc/leak-lint';
import {
  buildSeededConceptBody,
  SEED_CATALOG_TARGETS,
  type SeededCatalogEntry,
} from './bootstrap';

const SAMPLE_ENTRIES: SeededCatalogEntry[] = [
  {
    catalog: 'strategy_families',
    entryKey: 'strat-001',
    title: 'opening_range_breakout',
    tier: 'tier_a',
  },
  {
    catalog: 'guardrail_packages',
    entryKey: 'grd-001',
    title: 'event_conflict_blackout',
    tier: null,
  },
  {
    catalog: 'session_constraints',
    entryKey: 'sess-001',
    title: 'regular_equities',
    tier: null,
  },
  {
    catalog: 'trend_lead_patterns',
    entryKey: 'lead-003',
    title: 'macro_shock_blackout_then_reentry',
    tier: null,
  },
];

describe('SEED_CATALOG_TARGETS', () => {
  it('lists every bootstrap catalog pair once', () => {
    expect(SEED_CATALOG_TARGETS.length).toBe(12);
    const keys = new Set(SEED_CATALOG_TARGETS.map((t) => `${t.catalog}/${t.entryKey}`));
    expect(keys.size).toBe(SEED_CATALOG_TARGETS.length);
    expect(keys.has('strategy_families/strat-001')).toBe(true);
    expect(keys.has('trend_lead_patterns/lead-003')).toBe(true);
  });
});

describe('buildSeededConceptBody', () => {
  it('produces leak-lint-clean bodies for sample catalog entries', () => {
    for (const entry of SAMPLE_ENTRIES) {
      const body = buildSeededConceptBody(entry);
      const lint = leakLint(body, []);
      expect(lint.ok, `leak on ${entry.catalog}/${entry.entryKey}: ${JSON.stringify(lint.leaks)}`).toBe(
        true,
      );
      expect(body).toContain(entry.catalog.replace(/_/g, ' '));
      expect(body).not.toContain(entry.entryKey);
    }
  });

  it('covers every SEED_CATALOG_TARGETS pair with a lint-safe stub body', () => {
    for (const target of SEED_CATALOG_TARGETS) {
      const body = buildSeededConceptBody({
        catalog: target.catalog,
        entryKey: target.entryKey,
        title: `seeded_${target.catalog}`,
        tier: target.catalog === 'strategy_families' ? 'tier_b' : null,
      });
      expect(leakLint(body, []).ok).toBe(true);
    }
  });
});
