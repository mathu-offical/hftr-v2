import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Recovery ladder template lookup (v1 parity, catalog-backed).
 */

export interface RecoveryLadderTemplate {
  id: string;
  name: string;
  phases: readonly string[];
  appliesTo: readonly string[];
}

const CATALOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../db/src/seed/catalogs');

let cachedTemplates: ReadonlyMap<string, RecoveryLadderTemplate> | null = null;

export function loadRecoveryLadderTemplates(): ReadonlyMap<string, RecoveryLadderTemplate> {
  if (cachedTemplates) return cachedTemplates;
  const source = JSON.parse(
    readFileSync(join(CATALOG_DIR, 'seeded-strategy-catalog.json'), 'utf8'),
  ) as {
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

/** Pick the recovery-ladder template id grounded to a strategy family. */
export function recoveryTemplateForFamily(family: string): string {
  for (const tpl of loadRecoveryLadderTemplates().values()) {
    if (tpl.appliesTo.includes(family)) return tpl.id;
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
