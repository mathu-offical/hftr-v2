import { eq } from 'drizzle-orm';
import { EvidencePackage, ResearchSourceKind, SystemTopicScope } from '@hftr/contracts';
import type { ResearchSourceKind as ResearchSourceKindT } from '@hftr/contracts';
import { z } from 'zod';
import {
  buildResearchQueryPlan,
  gatherEvidencePackages,
  normalizeToEvidencePackage,
} from '@hftr/adapters';
import { modules } from '@hftr/db/schema';
import { ensureSystemLibrary } from '../libraries/ensure-system-library';
import { getSystemLibraryEntry } from '../libraries/system-library-registry';
import { resolveResearchGatherCredentials } from '../research/gather-credentials';
import {
  SECTOR_NEWS_LANE_SOURCE_KINDS,
  selectReadyLaneSourceKinds,
} from '../research/posture-sources';
import { corroborateAndNormalize } from '../research/verified-normalize';
import { persistVerifiedBundle } from '../research/seal-persist';
import { loadLatestValidSeal } from '../research/seal-load';
import { registerHandler } from './registry';

const SectorNewsPayload = z.object({
  companyId: z.string().uuid(),
  topicSectors: z.array(z.string().max(64)).max(12).optional(),
});

function buildSectorBulletinBody(opts: {
  sectorLabel: string;
  corroborationBand: string;
  headlines: string[];
}): string {
  const lines =
    opts.headlines.length > 0
      ? opts.headlines.map((h) => `- ${h}`).join('\n')
      : '- No multi-source cluster sealed; retain placeholder bulletin until gather succeeds.';

  return [
    '# Sector daily news bulletin',
    '',
    '## Sector focus',
    '',
    `Focus: ${opts.sectorLabel}. Corroboration band ${opts.corroborationBand}.`,
    '',
    '## Headlines',
    '',
    lines,
    '',
    '## Cross-links',
    '',
    'Relate to [[market_day_summary]] and company sector focus libraries when available.',
  ].join('\n');
}

registerHandler('library.system_sector_news', async ({ db, clock, job }) => {
  const payload = SectorNewsPayload.parse(job.payload);
  const now = new Date(clock.nowMs());
  const nowMs = clock.nowMs();

  const libraryId = await ensureSystemLibrary(
    db,
    payload.companyId,
    SystemTopicScope.SECTOR_NEWS,
    now,
    { refreshPlaceholders: true },
  );

  const entry = getSystemLibraryEntry(SystemTopicScope.SECTOR_NEWS);
  if (!entry) return;

  const subjectKey = 'sector_daily';
  const existing = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'sector_bulletin',
    subjectKey,
    nowMs,
  });
  if (existing) return;

  const companyModules = await db
    .select({ id: modules.id, type: modules.type, topicSectors: modules.topicSectors })
    .from(modules)
    .where(eq(modules.companyId, payload.companyId));
  const ownerModuleId =
    companyModules.find((m) => m.type === 'research')?.id ??
    companyModules.find((m) => m.type === 'librarian')?.id ??
    companyModules.find((m) => m.type === 'library')?.id;
  if (!ownerModuleId) return;

  const topicSectors =
    payload.topicSectors ??
    companyModules.find((m) => (m.topicSectors?.length ?? 0) > 0)?.topicSectors ??
    [];

  const plan = buildResearchQueryPlan({
    topicScope: SystemTopicScope.SECTOR_NEWS,
    topicSectors,
    queryText: 'sector daily news bulletin',
    cadence: 'every:1440',
  });

  // D-074: resolve BYOK at handler time — never from job payload.
  const gatherCredentials = await resolveResearchGatherCredentials(db, payload.companyId);
  const sourceKinds = selectReadyLaneSourceKinds(
    gatherCredentials,
    SECTOR_NEWS_LANE_SOURCE_KINDS,
  );

  const { packages, errors } = await gatherEvidencePackages({
    query: plan.baseQuery,
    queryBySource: plan.bySource,
    sourceKinds,
    allowlist: [],
    blocklist: [],
    maxEvidence: 16,
    marketNewsAllowDeterministicFallback: false,
    ...gatherCredentials,
  });

  // Public stubs / empty gathers must not auto-seal — only multi-source real packages.
  const usable = packages.filter(
    (pkg) =>
      pkg.legalUseClass === 'ALLOWED' &&
      !pkg.feedClass.includes('stub') &&
      !pkg.feedClass.includes('public_stub'),
  );

  let evidence: EvidencePackage[] = usable;
  if (evidence.length < 2) {
    // Soft path: qualitative catalog note only — seals at low band with short TTL; still dual-persists a report.
    evidence = [
      normalizeToEvidencePackage({
        sourceKind: 'catalog',
        feedClass: 'system_sector_bulletin',
        title: 'Sector bulletin placeholder cluster',
        summary:
          'Awaiting keyed multi-source gather. Retain sector focus and cross-links until corroboration rises.',
        authorityClass: 'DETERMINISTIC',
        legalUseClass: 'ALLOWED',
        expiresAt: new Date(nowMs + 6 * 60 * 60 * 1000).toISOString(),
      }),
      normalizeToEvidencePackage({
        sourceKind: 'library',
        feedClass: 'system_sector_bulletin',
        title: 'Library sector context',
        summary: 'Company sector focus libraries provide complementary qualitative context.',
        authorityClass: 'CURATED_BACKGROUND',
        legalUseClass: 'ALLOWED',
        expiresAt: new Date(nowMs + 6 * 60 * 60 * 1000).toISOString(),
      }),
    ];
  }

  void errors;

  const sectorLabel = topicSectors[0]?.trim() || 'company sector focus';

  const bundle = corroborateAndNormalize({
    evidence,
    kind: 'sector_bulletin',
    subjectKey,
    title: 'Sector daily bulletin',
    nowMs,
    topicScope: SystemTopicScope.SECTOR_NEWS,
    topicSectors,
  });
  if (!bundle) return;

  bundle.contributingSourceKinds = [
    ...new Set(evidence.map((p) => p.sourceKind)),
  ]
    .filter((k): k is ResearchSourceKindT => ResearchSourceKind.safeParse(k).success)
    .slice(0, 24);

  const headlines = bundle.view.items
    .map((item) => item.headline ?? '')
    .filter((h) => h.length > 0)
    .slice(0, 8);

  const reportBody = buildSectorBulletinBody({
    sectorLabel,
    corroborationBand: bundle.corroborationBand,
    headlines,
  });

  await persistVerifiedBundle({
    db,
    companyId: payload.companyId,
    moduleId: ownerModuleId,
    bundle,
    reportBody,
    reportTitle: 'sector_headlines_bulletin',
    libraryId,
    ownerModuleId,
    tags: entry.kindTags,
    now,
  });
});
