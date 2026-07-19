import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { modules } from '@hftr/db/schema';
import { AnalyzerModuleConfig } from '@hftr/contracts';

export type BindResearchPackResult = {
  updatedModuleIds: string[];
};

/** Idempotent merge of a library id into config.targetLibraryIds. */
export function mergeTargetLibraryIds(existing: readonly string[], libraryId: string): string[] {
  const normalized = existing.filter((id) => typeof id === 'string');
  if (normalized.includes(libraryId)) return [...normalized];
  return [...normalized, libraryId];
}

/**
 * D-184 §1: merge hub library id into research/librarian emit targets for a research ENGINE.
 * Analyzer modules with `to_library` also receive `targetLibraryModuleId` when hubModuleId is set.
 */
export async function bindResearchPackToHub(
  db: Db,
  companyId: string,
  researchEngineId: string,
  hubLibraryId: string,
  hubModuleId: string | null = null,
  now = new Date(),
): Promise<BindResearchPackResult> {
  const rows = await db
    .select({ id: modules.id, type: modules.type, config: modules.config })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, companyId),
        eq(modules.engineInstanceId, researchEngineId),
        inArray(modules.type, ['research', 'librarian', 'analyzer']),
      ),
    );

  const updatedModuleIds: string[] = [];
  for (const row of rows) {
    const cfg = { ...((row.config ?? {}) as Record<string, unknown>) };
    if (row.type === 'research' || row.type === 'librarian') {
      const existing = Array.isArray(cfg.targetLibraryIds)
        ? (cfg.targetLibraryIds as string[])
        : [];
      const next = mergeTargetLibraryIds(existing, hubLibraryId);
      if (next.length === existing.length) continue;
      cfg.targetLibraryIds = next;
    } else if (row.type === 'analyzer') {
      const parsed = AnalyzerModuleConfig.safeParse(cfg);
      if (!parsed.success) continue;
      if (parsed.data.emitMode !== 'to_library' && parsed.data.emitMode !== 'to_desk_stream') {
        continue;
      }
      const existing = Array.isArray(cfg.targetLibraryIds)
        ? (cfg.targetLibraryIds as string[])
        : [];
      const next = mergeTargetLibraryIds(existing, hubLibraryId);
      if (parsed.data.emitMode === 'to_library' && hubModuleId) {
        if (parsed.data.targetLibraryModuleId === hubModuleId && next.length === existing.length) {
          continue;
        }
        cfg.targetLibraryModuleId = hubModuleId;
      } else if (next.length === existing.length) {
        continue;
      }
      cfg.targetLibraryIds = next;
    } else {
      continue;
    }

    await db
      .update(modules)
      .set({ config: cfg, updatedAt: now })
      .where(eq(modules.id, row.id));
    updatedModuleIds.push(row.id);
  }

  return { updatedModuleIds };
}
