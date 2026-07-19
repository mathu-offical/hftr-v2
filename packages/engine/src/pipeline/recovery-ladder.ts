import seededStrategyCatalog from '../../../db/src/seed/catalogs/seeded-strategy-catalog.json';
import { resolveStrategyFamilyForRecovery } from './strategy-family-aliases';

/**
 * Recovery ladder template lookup (v1 parity, catalog-backed).
 * Bundled via static import (Vercel serverless safe — no filesystem reads).
 */

export interface RecoveryLadderTemplate {
  id: string;
  name: string;
  phases: readonly string[];
  appliesTo: readonly string[];
}

let cachedTemplates: ReadonlyMap<string, RecoveryLadderTemplate> | null = null;

export function loadRecoveryLadderTemplates(): ReadonlyMap<string, RecoveryLadderTemplate> {
  if (cachedTemplates) return cachedTemplates;
  const source = seededStrategyCatalog as {
    recoveryLadderTemplates?: Array<{
      id: string;
      name: string;
      phases: string[];
      appliesTo: string[];
    }>;
  };
  const entries: [string, RecoveryLadderTemplate][] = (source.recoveryLadderTemplates ?? []).map(
    (tpl) => [
      tpl.id,
      Object.freeze({
        id: tpl.id,
        name: tpl.name,
        phases: Object.freeze([...tpl.phases]),
        appliesTo: Object.freeze([...tpl.appliesTo]),
      }),
    ],
  );
  cachedTemplates = Object.freeze(new Map(entries)) as ReadonlyMap<string, RecoveryLadderTemplate>;
  return cachedTemplates;
}

/**
 * Pick the recovery-ladder template id grounded to a strategy family.
 * Accepts catalog names (`opening_range_breakout`) or seeded ids (`strat-001`).
 * Microstructure / market_making → rec-006 (IS trajectory); other families prefer
 * specific ladders; unknown → rec-001.
 */
export function recoveryTemplateForFamily(family: string): string {
  const resolved = resolveStrategyFamilyForRecovery(family);
  if (resolved === 'market_making' || family === 'strat-007') {
    return 'rec-006';
  }

  for (const tpl of loadRecoveryLadderTemplates().values()) {
    if (tpl.id === 'rec-001' || tpl.id === 'rec-006') continue;
    if (tpl.appliesTo.includes(resolved) || tpl.appliesTo.includes(family)) {
      return tpl.id;
    }
  }
  return 'rec-001';
}

export function getRecoveryLadderTemplate(templateId: string): RecoveryLadderTemplate | undefined {
  return loadRecoveryLadderTemplates().get(templateId);
}

/** Reset catalog cache (tests only). */
export function resetRecoveryLadderCache(): void {
  cachedTemplates = null;
}
