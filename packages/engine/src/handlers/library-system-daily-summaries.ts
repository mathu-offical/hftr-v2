import { eq } from 'drizzle-orm';
import {
  MARKET_HUB_ANALYZE_PHASE_META,
  MarketHubAnalyzePhase,
  normalizeAnalyzePhase,
  SystemTopicScope,
  VerifiedNormalizedBundle,
  type MarketHubAnalyzePhase as AnalyzePhase,
  type SessionPhase,
} from '@hftr/contracts';
import { z } from 'zod';
import { modules } from '@hftr/db/schema';
import { ensureSystemLibrary } from '../libraries/ensure-system-library';
import { getSystemLibraryEntry } from '../libraries/system-library-registry';
import { loadLatestValidSeal } from '../research/seal-load';
import { corroborateAndNormalize } from '../research/verified-normalize';
import { persistVerifiedBundle } from '../research/seal-persist';
import { recordSynthesisStage } from '../research/market-hub-synthesis';
import { normalizeToEvidencePackage } from '@hftr/adapters';
import { resolveAnalyzePhase, analyzePhaseLabel } from '../calendar/analyze-phase';
import { getSession, venueDate } from '../calendar/calendar';
import { registerHandler } from './registry';

/** @deprecated Prefer MarketHubAnalyzePhase (D-181). Kept for payload parse of legacy jobs. */
export const DailySummaryPhase = z.union([
  z.enum(['pre_open', 'midday', 'close', 'post_analysis']),
  MarketHubAnalyzePhase,
]);
export type DailySummaryPhase = z.infer<typeof DailySummaryPhase>;

const DailySummariesPayload = z.object({
  companyId: z.string().uuid(),
  /** Analyze cadence slot (D-181) or legacy D-070 four-slot tag. */
  phase: z.string().max(40).optional(),
  /** Operator Analyze: re-seal even when phase seal is still valid (D-111). */
  forceReseal: z.boolean().optional(),
  synthesisRunId: z.string().uuid().optional(),
});

/**
 * Coarse SessionPhase → analyze slot (legacy). Prefer resolveAnalyzePhase(session, nowMs).
 * @deprecated D-181
 */
export function dailySummaryPhaseFromSession(phase: SessionPhase): AnalyzePhase {
  switch (phase) {
    case 'pre_market':
      return 'pre_market';
    case 'open':
      return 'mid_morning';
    case 'midday':
      return 'midday';
    case 'power_hour':
      return 'market_close';
    case 'closed':
    case 'overnight':
      return 'evening';
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

const PHASE_SECTION: Record<
  AnalyzePhase,
  { heading: string; active: string; idle: string }
> = {
  overnight: {
    heading: 'Overnight',
    active:
      'Asia/Europe spillover and overnight news flow. Emphasize FX/crypto/macro lanes and cross-session headlines. Prefer [[sector_headlines_bulletin]].',
    idle: 'Overnight append pending. Prefer [[sector_headlines_bulletin]].',
  },
  wake_up: {
    heading: 'Wake-up',
    active:
      'Previous-night summary and overnight orientation into the US session. Prefer [[daily_movers_report]] when sealed.',
    idle: 'Wake-up notes retained from prior seal when available. See [[daily_movers_report]].',
  },
  pre_market: {
    heading: 'Pre-market',
    active:
      'Morning news, other time zones, and market-condition context before the open. Cross-check [[sector_headlines_bulletin]].',
    idle: 'Pre-market append pending next cadence window. Prefer [[sector_headlines_bulletin]].',
  },
  open_bell: {
    heading: 'Open bell',
    active:
      'Open print, gap reaction, and first liquidity pulse. Prefer [[daily_movers_report]] for opening-range leadership.',
    idle: 'Open-bell append pending. Retain [[daily_movers_report]] continuity.',
  },
  mid_morning: {
    heading: 'Mid-morning',
    active:
      'Initial RTH movements, relative strength, and volume expansion. Prefer [[daily_movers_report]].',
    idle: 'Mid-morning append pending. Retain [[daily_movers_report]] continuity.',
  },
  midday: {
    heading: 'Midday',
    active:
      'Progress check-in: book vs tape, watchlist alignment, sector rotation. Cross-check [[sector_headlines_bulletin]].',
    idle: 'Midday append pending next cadence window. Prefer [[sector_headlines_bulletin]].',
  },
  afternoon: {
    heading: 'Afternoon',
    active:
      'Pre-close exit strategies, late-session risk, and held-name stress. Pair with [[market_day_summary]] themes.',
    idle: 'Afternoon append pending. Retain [[market_day_summary]] continuity.',
  },
  power_hour: {
    heading: 'Power hour',
    active:
      'Final-hour liquidity, rebalance flows, and close positioning pressure. Prefer [[daily_movers_report]] and [[market_day_summary]].',
    idle: 'Power-hour append pending. Retain [[daily_movers_report]] continuity.',
  },
  market_close: {
    heading: 'Market close',
    active:
      'Full day summary at/near the bell — leadership, breadth vs concentration, session outcome. Prefer [[market_day_summary]].',
    idle: 'Market-close append pending session close window.',
  },
  evening: {
    heading: 'Evening',
    active:
      'After-hours news grounded in market-day movements and next-session setup. Cross-link [[sector_headlines_bulletin]] and [[daily_movers_report]].',
    idle: 'Evening append pending. Prefer [[sector_headlines_bulletin]] and [[daily_movers_report]].',
  },
};

function buildDailySummaryBody(opts: {
  phase: AnalyzePhase;
  corroborationBand: string;
  moversStale: boolean;
  sectorStale: boolean;
}): string {
  const phaseLabel = analyzePhaseLabel(opts.phase);
  const moversNote = opts.moversStale
    ? 'Movers seal missing or stale — treat leadership notes as deferred.'
    : 'Movers seal present — leadership context attached without re-verify.';
  const sectorNote = opts.sectorStale
    ? 'Sector bulletin seal missing or stale — sector tape deferred.'
    : 'Sector bulletin seal present — headlines available without re-verify.';
  const meta = MARKET_HUB_ANALYZE_PHASE_META[opts.phase];
  const focusLine = `Bias «${meta.gatherBias}». Focus areas: ${meta.focusAreas.join('; ')}.`;

  const sections = MarketHubAnalyzePhase.options.flatMap((p) => {
    const sec = PHASE_SECTION[p];
    const body =
      p === opts.phase
        ? `${sec.active} ${moversNote} ${sectorNote} Corroboration ${opts.corroborationBand}. ${focusLine} Summary: ${meta.summary}.`
        : sec.idle;
    return [`## ${sec.heading}`, '', body, ''];
  });

  return [
    '# Daily session summary',
    '',
    `Active analyze slot: **${phaseLabel}** (${opts.phase}).`,
    '',
    `Timing intent: ${meta.summary}.`,
    '',
    ...sections,
  ].join('\n');
}

registerHandler('library.system_daily_summaries', async ({ db, clock, job }) => {
  const payload = DailySummariesPayload.parse(job.payload);
  const now = new Date(clock.nowMs());
  const nowMs = clock.nowMs();
  const runId = payload.synthesisRunId;

  const stage = async (
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped',
    summary?: string,
  ) => {
    if (!runId) return;
    await recordSynthesisStage(db, {
      runId,
      companyId: payload.companyId,
      stageId: 'daily',
      status,
      summary: summary ?? null,
      justificationLines: ['Calendar-phase rollup from seals'],
      jobId: job.id,
      now: new Date(clock.nowMs()),
    });
  };

  let phase: AnalyzePhase =
    normalizeAnalyzePhase(payload.phase) ?? 'pre_market';
  if (!payload.phase) {
    const timezone = 'America/New_York';
    const session = await getSession(db, 'XNYS', venueDate(nowMs, timezone));
    phase = resolveAnalyzePhase(session, nowMs);
  }

  await stage('running', `Daily summary phase ${phase}`);

  const libraryId = await ensureSystemLibrary(
    db,
    payload.companyId,
    SystemTopicScope.DAILY_SUMMARIES,
    now,
    { refreshPlaceholders: true },
  );

  const entry = getSystemLibraryEntry(SystemTopicScope.DAILY_SUMMARIES);
  if (!entry) {
    await stage('failed', 'Daily summaries registry missing');
    return;
  }

  const subjectKey = `phase_${phase}`;
  const existing = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'daily_summary_phase',
    subjectKey,
    nowMs,
  });
  if (existing && !payload.forceReseal) {
    await stage('skipped', `Valid daily seal retained (${phase})`);
    return;
  }

  const companyModules = await db
    .select({ id: modules.id, type: modules.type })
    .from(modules)
    .where(eq(modules.companyId, payload.companyId));
  const ownerModuleId =
    companyModules.find((m) => m.type === 'research')?.id ??
    companyModules.find((m) => m.type === 'librarian')?.id ??
    companyModules.find((m) => m.type === 'library')?.id;
  if (!ownerModuleId) {
    await stage('failed', 'No research/library module to own daily seal');
    return;
  }

  const moversSeal = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'movers_board',
    subjectKey: 'daily',
    nowMs,
  });
  const sectorSeal = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'sector_bulletin',
    subjectKey: 'sector_daily',
    nowMs,
  });

  const evidence = [
    normalizeToEvidencePackage({
      sourceKind: 'library',
      feedClass: 'system_daily_summary',
      title: 'Daily summary phase rollup',
      summary: `Phase ${phase} rollup from sealed system libraries when present.`,
      authorityClass: 'DETERMINISTIC',
      legalUseClass: 'ALLOWED',
      expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
    }),
  ];

  if (moversSeal) {
    evidence.push(
      normalizeToEvidencePackage({
        sourceKind: 'catalog',
        feedClass: 'seal_reuse',
        title: moversSeal.view.title,
        summary: 'Reusing valid movers board seal without re-verification.',
        authorityClass: 'DETERMINISTIC',
        legalUseClass: 'ALLOWED',
        expiresAt: moversSeal.expiresAt,
        artifactRefs: [`seal:${moversSeal.sealId}`],
      }),
    );
  }
  if (sectorSeal) {
    evidence.push(
      normalizeToEvidencePackage({
        sourceKind: 'catalog',
        feedClass: 'seal_reuse',
        title: sectorSeal.view.title,
        summary: 'Reusing valid sector bulletin seal without re-verification.',
        authorityClass: 'DETERMINISTIC',
        legalUseClass: 'ALLOWED',
        expiresAt: sectorSeal.expiresAt,
        artifactRefs: [`seal:${sectorSeal.sealId}`],
      }),
    );
  }

  const bundle = corroborateAndNormalize({
    evidence,
    kind: 'daily_summary_phase',
    subjectKey,
    title: `Daily summary ${phase}`,
    nowMs,
    topicScope: SystemTopicScope.DAILY_SUMMARIES,
  });
  if (!bundle) {
    await stage('failed', 'Daily corroboration failed');
    return;
  }

  // Prefer attaching movers/sector seal digests into the daily seal snapshot.
  const enriched: VerifiedNormalizedBundle = {
    ...bundle,
    sourceDigests: [
      ...new Set([
        ...bundle.sourceDigests,
        ...(moversSeal?.sourceDigests ?? []),
        ...(sectorSeal?.sourceDigests ?? []),
      ]),
    ].slice(0, 24),
  };

  const reportBody = buildDailySummaryBody({
    phase,
    corroborationBand: enriched.corroborationBand,
    moversStale: !moversSeal,
    sectorStale: !sectorSeal,
  });

  await persistVerifiedBundle({
    db,
    companyId: payload.companyId,
    moduleId: ownerModuleId,
    bundle: enriched,
    reportBody,
    reportTitle: 'market_day_summary',
    libraryId,
    ownerModuleId,
    tags: entry.kindTags,
    now,
  });
  await stage(
    'succeeded',
    `Sealed daily ${phase} (${enriched.corroborationBand}) · movers ${moversSeal ? 'present' : 'stale'} · sector ${sectorSeal ? 'present' : 'stale'}`,
  );
});
