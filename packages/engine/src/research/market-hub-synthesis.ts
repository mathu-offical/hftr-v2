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
  const outcomes = await getSealStageOutcomes(db, runId);
  return {
    movers: outcomes.movers.terminal,
    sector: outcomes.sector.terminal,
    daily: outcomes.daily.terminal,
  };
}

export type SealStageOutcome = {
  status: MarketHubSynthesisStageStatus | null;
  terminal: boolean;
  ok: boolean;
};

/** Seal-path stage outcomes for narrative gating (D-120). */
export async function getSealStageOutcomes(
  db: Db,
  runId: string,
): Promise<{
  movers: SealStageOutcome;
  sector: SealStageOutcome;
  daily: SealStageOutcome;
}> {
  const rows = await db
    .select({
      stageId: marketHubSynthesisStages.stageId,
      status: marketHubSynthesisStages.status,
    })
    .from(marketHubSynthesisStages)
    .where(eq(marketHubSynthesisStages.runId, runId));

  const byId = new Map(rows.map((r) => [r.stageId, r.status as MarketHubSynthesisStageStatus]));
  const outcome = (id: MarketHubSynthesisStageId): SealStageOutcome => {
    const status = byId.get(id) ?? null;
    const terminal =
      status === 'succeeded' || status === 'skipped' || status === 'failed';
    const ok = status === 'succeeded' || status === 'skipped';
    return { status, terminal, ok };
  };
  return {
    movers: outcome('seal_movers'),
    sector: outcome('sector'),
    daily: outcome('daily'),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll until movers/sector/daily stages are terminal (or timeout).
 * Narrative must not compose before parallel reseal jobs finish.
 */
export async function waitForSealStages(
  db: Db,
  runId: string,
  opts?: { timeoutMs?: number; pollMs?: number },
): Promise<{
  movers: SealStageOutcome;
  sector: SealStageOutcome;
  daily: SealStageOutcome;
  timedOut: boolean;
}> {
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const pollMs = opts?.pollMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;
  let last = await getSealStageOutcomes(db, runId);
  while (Date.now() < deadline) {
    if (last.movers.terminal && last.sector.terminal && last.daily.terminal) {
      return { ...last, timedOut: false };
    }
    await sleep(pollMs);
    last = await getSealStageOutcomes(db, runId);
  }
  return { ...last, timedOut: true };
}

/** After narrative: mark hub_ready and close the run (partial if seals missing/failed). */
export async function completeSynthesisRunAfterNarrative(
  db: Db,
  opts: {
    runId: string;
    companyId: string;
    now: Date;
    partial?: boolean;
    failed?: boolean;
    errorCode?: string | null;
  },
): Promise<void> {
  const seals = await getSealStageOutcomes(db, opts.runId);
  const sealFailed = !seals.movers.ok || !seals.sector.ok || !seals.daily.ok;
  const partial = Boolean(opts.partial) || sealFailed;
  const failed = Boolean(opts.failed);

  await recordSynthesisStage(db, {
    runId: opts.runId,
    companyId: opts.companyId,
    stageId: 'hub_ready',
    status: failed ? 'failed' : 'succeeded',
    summary: failed
      ? 'Hub not ready — narrative or upstream stage failed'
      : partial
        ? 'Hub projection ready with partial seals'
        : 'Hub projection ready for Sync / live merge',
    justificationLines: [
      'Deterministic hub GET; seals dual-persisted when present',
      `seal_movers ${seals.movers.status ?? 'missing'}`,
      `sector ${seals.sector.status ?? 'missing'}`,
      `daily ${seals.daily.status ?? 'missing'}`,
    ],
    now: opts.now,
  });

  await finalizeSynthesisRun(db, {
    runId: opts.runId,
    companyId: opts.companyId,
    status: failed ? 'failed' : partial ? 'partial' : 'succeeded',
    ...(opts.errorCode !== undefined ? { errorCode: opts.errorCode } : {}),
    now: opts.now,
  });
}
