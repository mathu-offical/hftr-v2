/**
 * System-defined qualitative similarity between seeded catalog folders (D-164).
 * Used to place folder spheres by actual catalog relations — not Fibonacci order alone.
 * Bands are model-free; unspecified pairs default to `low` (more separation).
 */

import type { SeedCatalogId } from './research-library-shelves';
import { SEED_CATALOG_SHELVES } from './research-library-shelves';
import type { SimilarityBand } from './galaxy-similarity';

type FolderPair = readonly [SeedCatalogId, SeedCatalogId, Exclude<SimilarityBand, 'low'>];

/**
 * Curated catalog-folder relations for the Seeded trading mechanisms library.
 * High = tightly related mechanisms; medium = related but distinct; omitted = low.
 */
const SEED_FOLDER_RELATION_PAIRS: readonly FolderPair[] = [
  ['strategy_families', 'compound_strategies', 'high'],
  ['strategy_families', 'trend_lead_patterns', 'high'],
  ['strategy_families', 'recovery_ladders', 'medium'],
  ['strategy_families', 'guardrail_packages', 'medium'],
  ['strategy_families', 'sector_seeds', 'medium'],
  ['compound_strategies', 'recovery_ladders', 'high'],
  ['compound_strategies', 'trend_lead_patterns', 'medium'],
  ['compound_strategies', 'guardrail_packages', 'medium'],
  ['recovery_ladders', 'guardrail_packages', 'high'],
  ['recovery_ladders', 'session_constraints', 'medium'],
  ['guardrail_packages', 'session_constraints', 'high'],
  ['guardrail_packages', 'compliance_packages', 'high'],
  ['guardrail_packages', 'broker_policy_envelopes', 'medium'],
  ['session_constraints', 'broker_policy_envelopes', 'high'],
  ['session_constraints', 'compliance_packages', 'medium'],
  ['broker_policy_envelopes', 'compliance_packages', 'medium'],
  ['trend_lead_patterns', 'event_archetypes', 'medium'],
  ['trend_lead_patterns', 'macro_triggers', 'medium'],
  ['event_archetypes', 'macro_triggers', 'high'],
  ['macro_triggers', 'sector_seeds', 'medium'],
  ['event_archetypes', 'sector_seeds', 'medium'],
  // Explicitly distant domains stay low via default (e.g. compliance ↔ trend leads).
] as const;

const CATALOG_KEY_SET = new Set<string>(SEED_CATALOG_SHELVES.map((s) => s.catalog));

const PAIR_BAND = new Map<string, SimilarityBand>();
for (const [a, b, band] of SEED_FOLDER_RELATION_PAIRS) {
  const key = a < b ? `${a}::${b}` : `${b}::${a}`;
  PAIR_BAND.set(key, band);
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

/** True when both keys are seeded catalog folder ids. */
export function isSeedCatalogFolderKey(key: string): boolean {
  return CATALOG_KEY_SET.has(key);
}

/**
 * System similarity band between two folder keys.
 * Runtime / unknown folders → `low` (independent placement).
 * Same key → `high`.
 */
export function seedFolderSimilarityBand(leftKey: string, rightKey: string): SimilarityBand {
  if (leftKey === rightKey) return 'high';
  if (!isSeedCatalogFolderKey(leftKey) || !isSeedCatalogFolderKey(rightKey)) {
    return 'low';
  }
  return PAIR_BAND.get(pairKey(leftKey, rightKey)) ?? 'low';
}

/** Rest-length multiplier from similarity (relative to ra+rb). */
export function folderSimilarityRestMul(band: SimilarityBand): number {
  switch (band) {
    case 'high':
      return 1.22;
    case 'medium':
      return 1.9;
    case 'low':
      return 3.05;
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

/** Spring strength for folder-pair layout (qualitative). */
export function folderSimilaritySpringStrength(band: SimilarityBand): number {
  switch (band) {
    case 'high':
      return 0.4;
    case 'medium':
      return 0.2;
    case 'low':
      return 0.08;
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

/** Exposed for tests / docs — number of curated high/medium pairs. */
export function seedFolderRelationPairCount(): number {
  return SEED_FOLDER_RELATION_PAIRS.length;
}
