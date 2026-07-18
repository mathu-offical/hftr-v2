import { eq } from 'drizzle-orm';
import { SystemTopicScope, VerifiedNormalizedBundle, type SessionPhase } from '@hftr/contracts';
import { z } from 'zod';
import { modules } from '@hftr/db/schema';
import { ensureSystemLibrary } from '../libraries/ensure-system-library';
import { getSystemLibraryEntry } from '../libraries/system-library-registry';
import { loadLatestValidSeal } from '../research/seal-load';
import { corroborateAndNormalize } from '../research/verified-normalize';
import { persistVerifiedBundle } from '../research/seal-persist';
import { normalizeToEvidencePackage } from '@hftr/adapters';
import { getSession, sessionPhase, venueDate } from '../calendar/calendar';
import { registerHandler } from './registry';

export const DailySummaryPhase = z.enum(['pre_open', 'midday', 'close', 'post_analysis']);
export type DailySummaryPhase = z.infer<typeof DailySummaryPhase>;

const DailySummariesPayload = z.object({
  companyId: z.string().uuid(),
  /** Session phase tag for subject key / section emphasis. */
  phase: DailySummaryPhase.optional(),
  /** Operator Analyze: re-seal even when phase seal is still valid (D-111). */
  forceReseal: z.boolean().optional(),
});

/** Map market calendar SessionPhase → daily summary phase tag (D-070). */
export function dailySummaryPhaseFromSession(phase: SessionPhase): DailySummaryPhase {
  switch (phase) {
    case 'pre_market':
      return 'pre_open';
    case 'open':
    case 'midday':
      return 'midday';
    case 'power_hour':
      return 'close';
    case 'closed':
    case 'overnight':
      return 'post_analysis';
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function buildDailySummaryBody(opts: {
  phase: string;
  corroborationBand: string;
  moversStale: boolean;
  sectorStale: boolean;
}): string {
  const phaseLabel = opts.phase.replace(/_/g, '-');
  const moversNote = opts.moversStale
    ? 'Movers seal missing or stale — treat leadership notes as deferred.'
    : 'Movers seal present — leadership context attached without re-verify.';
  const sectorNote = opts.sectorStale
    ? 'Sector bulletin seal missing or stale — sector tape deferred.'
    : 'Sector bulletin seal present — headlines available without re-verify.';

  return [
    '# Daily session summary',
    '',
    '## Pre-open',
    '',
    opts.phase === 'pre_open'
      ? `Phase ${phaseLabel}. ${moversNote} ${sectorNote} Corroboration ${opts.corroborationBand}. Prefer [[daily_movers_report]] when sealed.`
      : 'Pre-open phase notes retained from prior seal when available. See [[daily_movers_report]].',
    '',
    '## Midday',
    '',
    opts.phase === 'midday'
      ? `Midday append. ${moversNote} ${sectorNote} Cross-check [[sector_headlines_bulletin]].`
      : 'Midday append pending next cadence window. Prefer [[sector_headlines_bulletin]].',
    '',
    '## Close',
    '',
    opts.phase === 'close'
      ? `Close append. ${moversNote} ${sectorNote} Pair with [[market_day_summary]] themes.`
      : 'Close append pending session close window. Retain [[market_day_summary]] continuity.',
    '',
    '## Post-analysis',
    '',
    opts.phase === 'post_analysis'
      ? `Post-analysis. Cross-link [[sector_headlines_bulletin]] and [[daily_movers_report]] when sealed.`
      : 'Post-analysis pending. Prefer [[sector_headlines_bulletin]] and [[daily_movers_report]].',
  ].join('\n');
}

registerHandler('library.system_daily_summaries', async ({ db, clock, job }) => {
  const payload = DailySummariesPayload.parse(job.payload);
  const now = new Date(clock.nowMs());
  const nowMs = clock.nowMs();

  let phase: DailySummaryPhase = payload.phase ?? 'pre_open';
  if (!payload.phase) {
    const timezone = 'America/New_York';
    const session = await getSession(db, 'XNYS', venueDate(nowMs, timezone));
    phase = dailySummaryPhaseFromSession(sessionPhase(session, nowMs));
  }

  const libraryId = await ensureSystemLibrary(
    db,
    payload.companyId,
    SystemTopicScope.DAILY_SUMMARIES,
    now,
    { refreshPlaceholders: true },
  );

  const entry = getSystemLibraryEntry(SystemTopicScope.DAILY_SUMMARIES);
  if (!entry) return;

  const subjectKey = `phase_${phase}`;
  const existing = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'daily_summary_phase',
    subjectKey,
    nowMs,
  });
  if (existing && !payload.forceReseal) return;

  const companyModules = await db
    .select({ id: modules.id, type: modules.type })
    .from(modules)
    .where(eq(modules.companyId, payload.companyId));
  const ownerModuleId =
    companyModules.find((m) => m.type === 'research')?.id ??
    companyModules.find((m) => m.type === 'librarian')?.id ??
    companyModules.find((m) => m.type === 'library')?.id;
  if (!ownerModuleId) return;

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
  if (!bundle) return;

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
});
