import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { leakLint } from '../calc/leak-lint';
import {
  buildSeededConceptBody,
  SEED_CATALOG_NAMES,
  SEED_CATALOG_TARGETS,
  type SeededCatalogEntry,
} from './bootstrap';

const CATALOG_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../db/src/seed/catalogs',
);

function loadPayload(file: string, arrayKey: string, id: string): Record<string, unknown> {
  const data = JSON.parse(readFileSync(join(CATALOG_DIR, file), 'utf8')) as Record<
    string,
    Array<Record<string, unknown>>
  >;
  const entry = data[arrayKey]?.find((row) => row.id === id);
  if (!entry) throw new Error(`missing ${file} ${id}`);
  return entry;
}

const SAMPLE_ENTRIES: SeededCatalogEntry[] = [
  {
    catalog: 'strategy_families',
    entryKey: 'strat-001',
    title: 'opening_range_breakout',
    tier: 'tier_a',
    payload: loadPayload('seeded-strategy-catalog.json', 'families', 'strat-001'),
  },
  {
    catalog: 'guardrail_packages',
    entryKey: 'grd-001',
    title: 'event_conflict_blackout',
    tier: null,
    payload: loadPayload('guardrail-recovery-package-catalog.json', 'packages', 'grd-001'),
  },
  {
    catalog: 'session_constraints',
    entryKey: 'sess-001',
    title: 'regular_equities',
    tier: null,
    payload: loadPayload('session-constraint-catalog.json', 'sessions', 'sess-001'),
  },
  {
    catalog: 'trend_lead_patterns',
    entryKey: 'lead-003',
    title: 'macro_shock_blackout_then_reentry',
    tier: null,
    payload: loadPayload('trend-lead-pattern-library.json', 'patterns', 'lead-003'),
  },
];

describe('SEED_CATALOG_TARGETS', () => {
  it('lists representative bootstrap catalog pairs once', () => {
    expect(SEED_CATALOG_TARGETS.length).toBe(12);
    const keys = new Set(SEED_CATALOG_TARGETS.map((t) => `${t.catalog}/${t.entryKey}`));
    expect(keys.size).toBe(SEED_CATALOG_TARGETS.length);
    expect(keys.has('strategy_families/strat-001')).toBe(true);
    expect(keys.has('trend_lead_patterns/lead-003')).toBe(true);
  });

  it('covers every SEED_CATALOG_NAMES family', () => {
    for (const name of SEED_CATALOG_NAMES) {
      expect(SEED_CATALOG_TARGETS.some((t) => t.catalog === name)).toBe(true);
    }
  });
});

describe('buildSeededConceptBody', () => {
  it('produces leak-lint-clean catalog bodies without placeholder prose', () => {
    for (const entry of SAMPLE_ENTRIES) {
      const body = buildSeededConceptBody(entry);
      const lint = leakLint(body, []);
      expect(lint.ok, `leak on ${entry.catalog}/${entry.entryKey}: ${JSON.stringify(lint.leaks)}`).toBe(
        true,
      );
      expect(body.toLowerCase()).not.toContain('placeholder');
      expect(body).toContain('#');
      expect(body).toContain(entry.title.replace(/_/g, ' '));
      if (typeof (entry.payload as { summary?: string })?.summary === 'string') {
        expect(body).toContain((entry.payload as { summary: string }).summary);
      }
    }
  });

  it('builds leak-clean bodies for every vendored row in SEED_CATALOG_NAMES files', () => {
    const collections: Array<{ file: string; arrayKey: string; catalog: string }> = [
      { file: 'seeded-strategy-catalog.json', arrayKey: 'families', catalog: 'strategy_families' },
      {
        file: 'guardrail-recovery-package-catalog.json',
        arrayKey: 'packages',
        catalog: 'guardrail_packages',
      },
      {
        file: 'session-constraint-catalog.json',
        arrayKey: 'sessions',
        catalog: 'session_constraints',
      },
      {
        file: 'broker-policy-envelope-catalog.json',
        arrayKey: 'envelopes',
        catalog: 'broker_policy_envelopes',
      },
      {
        file: 'trend-lead-pattern-library.json',
        arrayKey: 'patterns',
        catalog: 'trend_lead_patterns',
      },
    ];

    let count = 0;
    for (const col of collections) {
      const data = JSON.parse(readFileSync(join(CATALOG_DIR, col.file), 'utf8')) as Record<
        string,
        Array<Record<string, unknown>>
      >;
      for (const row of data[col.arrayKey] ?? []) {
        const title = String(row.name ?? row.id);
        const body = buildSeededConceptBody({
          catalog: col.catalog,
          entryKey: String(row.id),
          title,
          tier: typeof row.activationTier === 'string' ? row.activationTier : null,
          payload: row,
        });
        expect(leakLint(body, []).ok, `${col.catalog}/${row.id}`).toBe(true);
        expect(body.toLowerCase()).not.toContain('placeholder');
        count += 1;
      }
    }
    expect(count).toBeGreaterThan(30);
  });
});
