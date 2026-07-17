/**
 * Seed the vendored v1 catalogs (./catalogs/*.json) into catalog_entries.
 * Idempotent: upserts by (catalog, entry_key). Each catalog file contributes
 * one or more entry collections; payload keeps the full source entry.
 *
 * Run: pnpm --filter @hftr/db exec tsx src/seed/seed-catalogs.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { getDb } from '../client';
import { catalogEntries } from '../schema/research';

const CATALOG_VERSION = 'v1_snapshot_2026_07_17';
const DIR = join(dirname(fileURLToPath(import.meta.url)), 'catalogs');

interface SourceCollection {
  file: string;
  arrayKey: string;
  catalog: string;
  title: (e: Record<string, unknown>) => string;
  tier?: (e: Record<string, unknown>) => string | null;
}

const COLLECTIONS: SourceCollection[] = [
  {
    file: 'seeded-strategy-catalog.json',
    arrayKey: 'families',
    catalog: 'strategy_families',
    title: (e) => String(e.name ?? e.id),
    tier: (e) => (typeof e.activationTier === 'string' ? e.activationTier : null),
  },
  {
    file: 'seeded-strategy-catalog.json',
    arrayKey: 'compoundStrategies',
    catalog: 'compound_strategies',
    title: (e) => String(e.name ?? e.id),
  },
  {
    file: 'seeded-strategy-catalog.json',
    arrayKey: 'recoveryLadderTemplates',
    catalog: 'recovery_ladders',
    title: (e) => String(e.name ?? e.id),
  },
  {
    file: 'guardrail-recovery-package-catalog.json',
    arrayKey: 'packages',
    catalog: 'guardrail_packages',
    title: (e) => String(e.name ?? e.id),
  },
  {
    file: 'broker-policy-envelope-catalog.json',
    arrayKey: 'envelopes',
    catalog: 'broker_policy_envelopes',
    title: (e) => String(e.name ?? e.id),
  },
  {
    file: 'session-constraint-catalog.json',
    arrayKey: 'sessions',
    catalog: 'session_constraints',
    title: (e) => String(e.name ?? e.id),
  },
  {
    file: 'compliance-policy-package-catalog.json',
    arrayKey: 'packages',
    catalog: 'compliance_packages',
    title: (e) => String(e.name ?? e.id),
  },
  {
    file: 'sector-behavior-seed-catalog.json',
    arrayKey: 'sectors',
    catalog: 'sector_seeds',
    title: (e) => String(e.sector ?? e.id),
  },
  {
    file: 'company-event-archetype-catalog.json',
    arrayKey: 'archetypes',
    catalog: 'event_archetypes',
    title: (e) => String(e.name ?? e.id),
  },
  {
    file: 'macro-geopolitical-trigger-catalog.json',
    arrayKey: 'triggers',
    catalog: 'macro_triggers',
    title: (e) => String(e.name ?? e.id),
  },
  {
    file: 'trend-lead-pattern-library.json',
    arrayKey: 'patterns',
    catalog: 'trend_lead_patterns',
    title: (e) => String(e.name ?? e.id),
  },
];

async function main() {
  const db = getDb();
  let total = 0;

  for (const col of COLLECTIONS) {
    const source = JSON.parse(readFileSync(join(DIR, col.file), 'utf8')) as Record<string, unknown>;
    const entries = source[col.arrayKey];
    if (!Array.isArray(entries)) {
      throw new Error(`${col.file}: expected array at "${col.arrayKey}"`);
    }
    for (const entry of entries as Record<string, unknown>[]) {
      const entryKey = String(entry.id ?? '');
      if (!entryKey) throw new Error(`${col.file}/${col.arrayKey}: entry missing id`);
      await db
        .insert(catalogEntries)
        .values({
          catalog: col.catalog,
          entryKey,
          catalogVersion: CATALOG_VERSION,
          title: col.title(entry),
          tier: col.tier ? col.tier(entry) : null,
          payload: entry,
        })
        .onConflictDoUpdate({
          target: [catalogEntries.catalog, catalogEntries.entryKey],
          set: {
            catalogVersion: CATALOG_VERSION,
            title: col.title(entry),
            tier: col.tier ? col.tier(entry) : null,
            payload: entry,
            updatedAt: sql`now()`,
          },
        });
      total += 1;
    }
    console.log(`${col.catalog}: ${entries.length} entries`);
  }
  console.log(`seeded ${total} catalog entries (${CATALOG_VERSION})`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
