/**
 * Durable Market posture synthesis run/stage helpers (D-120).
 */

import { and, asc, desc, eq } from 'drizzle-orm';
import {
  MARKET_HUB_SYNTHESIS_STAGE_META,
  MARKET_HUB_SYNTHESIS_STAGE_ORDER,
  type MarketHubSynthesisRun,
  type MarketHubSynthesisRunStatus,
  type MarketHubSynthesisStage,
  type MarketHubSynthesisStageId,
  type MarketHubSynthesisStageStatus,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { marketHubSynthesisRuns, marketHubSynthesisStages } from '@hftr/db/schema';

export async function createMarketHubSynthesisRun(
  db: Db,
  opts: { companyId: string; now: Date },
): Promise<string> {
  const inserted = await db
    .insert(marketHubSynthesisRuns)
    .values({
      companyId: opts.companyId,
      status: 'running',
      startedAt: opts.now,
      updatedAt: opts.now,
    })
    .returning({ id: marketHubSynthesisRuns.id });
  const runId = inserted[0]?.id;
  if (!runId) throw new Error('synthesis_run_create_failed');

  await db.insert(marketHubSynthesisStages).values(
    MARKET_HUB_SYNTHESIS_STAGE_ORDER.map((stageId, sortOrder) => {
      const meta = MARKET_HUB_SYNTHESIS_STAGE_META[stageId];
      return {
        runId,
        companyId: opts.companyId,
        stageId,
        label: meta.label,
        kind: meta.kind,
        status: 'queued' as const,
        sortOrder,
        justificationLines: [],
        updatedAt: opts.now,
      };
    }),
  );

  return runId;
}

export async function recordSynthesisStage(
  db: Db,
  opts: {
    runId: string;
    companyId: string;
    stageId: MarketHubSynthesisStageId;
    status: MarketHubSynthesisStageStatus;
    summary?: string | null;
    justificationLines?: string[];
    jobId?: string | null;
    now: Date;
  },
): Promise<void> {
  const meta = MARKET_HUB_SYNTHESIS_STAGE_META[opts.stageId];
  const sortOrder = MARKET_HUB_SYNTHESIS_STAGE_ORDER.indexOf(opts.stageId);
  const startedAt =
    opts.status === 'running' || opts.status === 'succeeded' || opts.status === 'failed'
      ? opts.now
      : null;
  const finishedAt =
    opts.status === 'succeeded' ||
    opts.status === 'failed' ||
    opts.status === 'skipped'
      ? opts.now
      : null;

  await db
    .insert(marketHubSynthesisStages)
    .values({
      runId: opts.runId,
      companyId: opts.companyId,
      stageId: opts.stageId,
      label: meta.label,
      kind: meta.kind,
      status: opts.status,
      sortOrder: sortOrder < 0 ? 99 : sortOrder,
      summary: opts.summary ?? null,
      justificationLines: opts.justificationLines ?? [],
      jobId: opts.jobId ?? null,
      startedAt,
      finishedAt,
      updatedAt: opts.now,
    })
    .onConflictDoUpdate({
      target: [marketHubSynthesisStages.runId, marketHubSynthesisStages.stageId],
      set: {
        status: opts.status,
        summary: opts.summary ?? undefined,
        justificationLines: opts.justificationLines ?? undefined,
        jobId: opts.jobId ?? undefined,
        startedAt:
          opts.status === 'running'
            ? opts.now
            : undefined,
        finishedAt: finishedAt ?? undefined,
        updatedAt: opts.now,
      },
    });
}

export async function finalizeSynthesisRun(
  db: Db,
  opts: {
    runId: string;
    companyId: string;
    status: MarketHubSynthesisRunStatus;
    errorCode?: string | null;
    now: Date;
  },
): Promise<void> {
  await db
    .update(marketHubSynthesisRuns)
    .set({
      status: opts.status,
      errorCode: opts.errorCode ?? null,
      finishedAt: opts.now,
      updatedAt: opts.now,
    })
    .where(
      and(
        eq(marketHubSynthesisRuns.id, opts.runId),
        eq(marketHubSynthesisRuns.companyId, opts.companyId),
      ),
    );
}

/** After narrative: mark hub_ready and close the run. */
export async function completeSynthesisRunAfterNarrative(
  db: Db,
  opts: { runId: string; companyId: string; now: Date; partial?: boolean },
): Promise<void> {
  await recordSynthesisStage(db, {
    runId: opts.runId,
    companyId: opts.companyId,
    stageId: 'hub_ready',
    status: 'succeeded',
    summary: 'Hub projection ready for Sync / live merge',
    justificationLines: ['Deterministic hub GET; seals dual-persisted'],
    now: opts.now,
  });
  await finalizeSynthesisRun(db, {
    runId: opts.runId,
    companyId: opts.companyId,
    status: opts.partial ? 'partial' : 'succeeded',
    now: opts.now,
  });
}

function mapStageRow(row: typeof marketHubSynthesisStages.$inferSelect): MarketHubSynthesisStage {
  const lines = Array.isArray(row.justificationLines)
    ? (row.justificationLines as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  return {
    id: row.id,
    runId: row.runId,
    stageId: row.stageId as MarketHubSynthesisStageId,
    label: row.label,
    kind: row.kind as MarketHubSynthesisStage['kind'],
    status: row.status as MarketHubSynthesisStageStatus,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    summary: row.summary,
    justificationLines: lines,
    jobId: row.jobId,
    sortOrder: row.sortOrder,
  };
}

export async function loadSynthesisRun(
  db: Db,
  opts: { companyId: string; runId: string },
): Promise<MarketHubSynthesisRun | null> {
  const [run] = await db
    .select()
    .from(marketHubSynthesisRuns)
    .where(
      and(
        eq(marketHubSynthesisRuns.id, opts.runId),
        eq(marketHubSynthesisRuns.companyId, opts.companyId),
      ),
    )
    .limit(1);
  if (!run) return null;

  const stages = await db
    .select()
    .from(marketHubSynthesisStages)
    .where(eq(marketHubSynthesisStages.runId, opts.runId))
    .orderBy(asc(marketHubSynthesisStages.sortOrder));

  return {
    id: run.id,
    companyId: run.companyId,
    status: run.status as MarketHubSynthesisRunStatus,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    errorCode: run.errorCode,
    stages: stages.map(mapStageRow),
  };
}

export async function loadLatestSynthesisRun(
  db: Db,
  opts: { companyId: string },
): Promise<MarketHubSynthesisRun | null> {
  const [run] = await db
    .select()
    .from(marketHubSynthesisRuns)
    .where(eq(marketHubSynthesisRuns.companyId, opts.companyId))
    .orderBy(desc(marketHubSynthesisRuns.startedAt))
    .limit(1);
  if (!run) return null;
  return loadSynthesisRun(db, { companyId: opts.companyId, runId: run.id });
}

export async function countTerminalSealStages(
  db: Db,
  runId: string,
): Promise<{ movers: boolean; sector: boolean; daily: boolean }> {
  const rows = await db
    .select({
      stageId: marketHubSynthesisStages.stageId,
      status: marketHubSynthesisStages.status,
    })
    .from(marketHubSynthesisStages)
    .where(eq(marketHubSynthesisStages.runId, runId));

  const byId = new Map(rows.map((r) => [r.stageId, r.status]));
  const done = (id: string) => {
    const s = byId.get(id);
    return s === 'succeeded' || s === 'skipped' || s === 'failed';
  };
  return {
    movers: done('seal_movers'),
    sector: done('sector'),
    daily: done('daily'),
  };
}
