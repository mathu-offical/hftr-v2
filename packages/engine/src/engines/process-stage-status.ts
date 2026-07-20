/**
 * D-237: Patch process-stage statuses on an engine's setup_snapshot.
 * JSON-only — no migration. Single spine per engine (last writer wins).
 */

import { and, eq } from 'drizzle-orm';
import {
  ProcessStageKind,
  ProcessStageStatus,
  type ProcessStageKind as StageKind,
  type ProcessStageSpec,
  type ProcessStageStatus as StageStatus,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { engineInstances, modules } from '@hftr/db/schema';

export async function resolveEngineIdForModule(
  db: Db,
  companyId: string,
  moduleId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ engineInstanceId: modules.engineInstanceId })
    .from(modules)
    .where(and(eq(modules.id, moduleId), eq(modules.companyId, companyId)))
    .limit(1);
  return row?.engineInstanceId ?? null;
}

/**
 * Apply status patches keyed by ProcessStageKind. Unknown kinds ignored.
 * Marks prior active stages as done when advancing (optional advancePrior).
 */
export async function patchEngineProcessStageStatuses(
  db: Db,
  opts: {
    companyId: string;
    engineInstanceId: string;
    patches: ReadonlyArray<{ kind: StageKind; status: StageStatus }>;
    /** When true, any stage still `active` not in patches becomes `done`. */
    clearActive?: boolean;
    now?: Date;
  },
): Promise<boolean> {
  const now = opts.now ?? new Date();
  const [engine] = await db
    .select({ setupSnapshot: engineInstances.setupSnapshot })
    .from(engineInstances)
    .where(
      and(
        eq(engineInstances.id, opts.engineInstanceId),
        eq(engineInstances.companyId, opts.companyId),
      ),
    )
    .limit(1);
  if (!engine) return false;

  const snap = (engine.setupSnapshot ?? {}) as {
    processStages?: ProcessStageSpec[];
    [key: string]: unknown;
  };
  const stages = Array.isArray(snap.processStages) ? [...snap.processStages] : [];
  if (stages.length === 0) return false;

  const patchMap = new Map(
    opts.patches.map((p) => {
      const kind = ProcessStageKind.parse(p.kind);
      const status = ProcessStageStatus.parse(p.status);
      return [kind, status] as const;
    }),
  );

  let changed = false;
  const nextStages = stages.map((stage) => {
    const kindParsed = ProcessStageKind.safeParse(stage.kind);
    if (!kindParsed.success) return stage;
    const patch = patchMap.get(kindParsed.data);
    if (patch) {
      if (stage.status === patch) return stage;
      changed = true;
      return { ...stage, status: patch };
    }
    if (opts.clearActive && stage.status === 'active') {
      changed = true;
      return { ...stage, status: 'done' as const };
    }
    return stage;
  });

  if (!changed) return false;

  await db
    .update(engineInstances)
    .set({
      setupSnapshot: { ...snap, processStages: nextStages },
      updatedAt: now,
    })
    .where(eq(engineInstances.id, opts.engineInstanceId));

  return true;
}

/** Resolve engine from module and patch stages in one call. */
export async function patchProcessStagesForModule(
  db: Db,
  companyId: string,
  moduleId: string,
  patches: ReadonlyArray<{ kind: StageKind; status: StageStatus }>,
  opts?: { clearActive?: boolean; now?: Date },
): Promise<void> {
  const engineId = await resolveEngineIdForModule(db, companyId, moduleId);
  if (!engineId) return;
  await patchEngineProcessStageStatuses(db, {
    companyId,
    engineInstanceId: engineId,
    patches,
    ...(opts?.clearActive !== undefined ? { clearActive: opts.clearActive } : {}),
    ...(opts?.now !== undefined ? { now: opts.now } : {}),
  });
}
