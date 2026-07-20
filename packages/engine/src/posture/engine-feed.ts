/**
 * D-243: Build MarketPostureEngineFeed from sealed views + orientation.
 * Engines pull this — not the UI MarketHubResponse monolith.
 */

import { createHash } from 'node:crypto';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  marketHubSynthesisRuns,
  marketHubSynthesisStages,
  systemNormalizedViews,
} from '@hftr/db/schema';
import {
  MarketPostureEngineFeed,
  type MarketPostureEngineFeed as Feed,
  type OrientationFreshness,
} from '@hftr/contracts';
import { loadLatestOrientation } from './build-orientation';

function sealSummary(
  row: {
    sealId: string;
    createdAt: Date | string | null;
    expiresAt: Date | string | null;
    bundle: unknown;
  } | null,
): {
  sealId: string;
  verifiedAt?: string;
  expiresAt?: string;
  corroborationBand?: string;
} | null {
  if (!row) return null;
  const bundle = row.bundle as { corroborationBand?: string; verifiedAt?: string } | null;
  const verifiedAt =
    typeof bundle?.verifiedAt === 'string'
      ? bundle.verifiedAt
      : row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : typeof row.createdAt === 'string'
          ? row.createdAt
          : undefined;
  const expiresAt =
    row.expiresAt instanceof Date
      ? row.expiresAt.toISOString()
      : typeof row.expiresAt === 'string'
        ? row.expiresAt
        : undefined;
  const out: {
    sealId: string;
    verifiedAt?: string;
    expiresAt?: string;
    corroborationBand?: string;
  } = { sealId: row.sealId };
  if (verifiedAt !== undefined) out.verifiedAt = verifiedAt;
  if (expiresAt !== undefined) out.expiresAt = expiresAt;
  if (bundle?.corroborationBand) out.corroborationBand = bundle.corroborationBand;
  return out;
}

async function loadSeal(
  db: Db,
  companyId: string,
  kind: string,
  subjectKey: string,
  now: Date,
) {
  const [row] = await db
    .select({
      sealId: systemNormalizedViews.sealId,
      createdAt: systemNormalizedViews.createdAt,
      expiresAt: systemNormalizedViews.expiresAt,
      bundle: systemNormalizedViews.bundle,
    })
    .from(systemNormalizedViews)
    .where(
      and(
        eq(systemNormalizedViews.companyId, companyId),
        eq(systemNormalizedViews.kind, kind),
        eq(systemNormalizedViews.subjectKey, subjectKey),
        gt(systemNormalizedViews.expiresAt, now),
      ),
    )
    .orderBy(desc(systemNormalizedViews.expiresAt))
    .limit(1);
  return row ?? null;
}

export async function loadPostureFeedForEngine(
  db: Db,
  companyId: string,
  nowMs = Date.now(),
): Promise<Feed> {
  const now = new Date(nowMs);
  const movers = await loadSeal(db, companyId, 'movers_board', 'daily', now);
  const sector = await loadSeal(db, companyId, 'sector_bulletin', 'sector_daily', now);
  const [dailyPhaseRow] = await db
    .select({
      sealId: systemNormalizedViews.sealId,
      createdAt: systemNormalizedViews.createdAt,
      expiresAt: systemNormalizedViews.expiresAt,
      bundle: systemNormalizedViews.bundle,
    })
    .from(systemNormalizedViews)
    .where(
      and(
        eq(systemNormalizedViews.companyId, companyId),
        eq(systemNormalizedViews.kind, 'daily_summary_phase'),
        gt(systemNormalizedViews.expiresAt, now),
      ),
    )
    .orderBy(desc(systemNormalizedViews.expiresAt))
    .limit(1);
  const dailyPhase = dailyPhaseRow ?? null;

  const [synth] = await db
    .select({ id: marketHubSynthesisRuns.id, status: marketHubSynthesisRuns.status })
    .from(marketHubSynthesisRuns)
    .where(eq(marketHubSynthesisRuns.companyId, companyId))
    .orderBy(desc(marketHubSynthesisRuns.createdAt))
    .limit(1);

  let analyzePhase: string | null = synth?.status ?? null;
  if (synth?.id) {
    const [stage] = await db
      .select({ stageId: marketHubSynthesisStages.stageId, status: marketHubSynthesisStages.status })
      .from(marketHubSynthesisStages)
      .where(eq(marketHubSynthesisStages.runId, synth.id))
      .orderBy(desc(marketHubSynthesisStages.sortOrder))
      .limit(1);
    if (stage) {
      analyzePhase = `${stage.stageId}:${stage.status}`;
    }
  }

  const orientation = await loadLatestOrientation(db, companyId, nowMs);
  const freshnessState: OrientationFreshness = orientation?.freshnessState ?? 'unknown';

  const moversBundle = movers?.bundle as {
    symbolIndex?: Record<string, number>;
    hubRevision?: string;
    view?: { items?: Array<{ symbolOrSector?: string }> };
  } | null;

  let symbolIndex = moversBundle?.symbolIndex ?? {};
  if (Object.keys(symbolIndex).length === 0 && moversBundle?.view?.items) {
    const built: Record<string, number> = {};
    moversBundle.view.items.forEach((item, i) => {
      const sym = item.symbolOrSector?.trim().toUpperCase();
      if (sym && built[sym] === undefined) built[sym] = i;
    });
    symbolIndex = built;
  }

  const hubRevision =
    moversBundle?.hubRevision ??
    createHash('sha256')
      .update(
        JSON.stringify({
          movers: movers?.sealId ?? null,
          sector: sector?.sealId ?? null,
          daily: dailyPhase?.sealId ?? null,
          orientation: orientation?.orientationId ?? null,
          synth: synth?.id ?? null,
        }),
      )
      .digest('hex')
      .slice(0, 32);

  return MarketPostureEngineFeed.parse({
    schemaVersion: 1,
    companyId,
    hubRevision,
    analyzePhase,
    orientationId: orientation?.orientationId ?? null,
    freshnessState,
    seals: {
      movers: sealSummary(movers),
      sector: sealSummary(sector),
      dailyPhase: sealSummary(dailyPhase),
    },
    symbolIndex,
    capturedAt: now.toISOString(),
  });
}
