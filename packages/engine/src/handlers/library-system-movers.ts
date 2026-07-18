import { and, eq, ne } from 'drizzle-orm';
import {
  EvidencePackage,
  ResearchSourceKind,
  SystemTopicScope,
  type SuggestionThresholdProfile,
} from '@hftr/contracts';
import type { ResearchSourceKind as ResearchSourceKindT } from '@hftr/contracts';
import { z } from 'zod';
import {
  buildResearchQueryPlan,
  fetchBars,
  gatherEvidencePackages,
  normalizeToEvidencePackage,
} from '@hftr/adapters';
import {
  companies,
  modules,
  positions,
  trendCandidates,
} from '@hftr/db/schema';
import { ensureSystemLibrary } from '../libraries/ensure-system-library';
import { ensureSectorKnowledge } from '../libraries/ensure-sector-knowledge';
import { getSystemLibraryEntry } from '../libraries/system-library-registry';
import {
  buildMoversUniverse,
  DEFAULT_LIQUID_FALLBACK,
  extractTickerCandidates,
  rankCompoundScores,
  scoreCompoundSymbol,
} from '../libraries/movers-compound';
import { listCompanyLibraryIds, loadMoversLibraryCorpus } from '../libraries/movers-corpus';
import { computeRelStrength } from '../libraries/movers-rel-strength';
import { proposeThresholdProfileHeuristic } from '../libraries/suggestion-threshold-propose';
import { resolveSuggestionThresholds } from '../libraries/suggestion-thresholds';
import {
  evaluateSuggestionVerifyGates,
  suggestionVerifyPasses,
} from '../libraries/suggestion-verify';
import {
  promoteVerifiedSuggestions,
  upsertMoversRankSuggestions,
} from '../libraries/watchlist-suggestions-persist';
import { resolvePhilosophyControl } from '../pipeline/philosophy-control';
import { resolveResearchGatherCredentials } from '../research/gather-credentials';
import {
  MOVERS_LANE_SOURCE_KINDS,
  selectReadyLaneSourceKinds,
} from '../research/posture-sources';
import { corroborateAndNormalize } from '../research/verified-normalize';
import { persistVerifiedBundle } from '../research/seal-persist';
import { loadLatestValidSeal } from '../research/seal-load';
import { recordSynthesisStage } from '../research/market-hub-synthesis';
import { registerHandler } from './registry';

const SystemMoversPayload = z.object({
  companyId: z.string().uuid(),
  /**
   * Operator Analyze: re-seal even when a valid movers_board seal exists (D-111).
   * Gather + compound + optional tactical LLM always run.
   */
  forceReseal: z.boolean().optional(),
  /** Live Model synthesis run (D-120). */
  synthesisRunId: z.string().uuid().optional(),
});

const NEWS_KINDS: ResearchSourceKindT[] = [
  'gdelt_news',
  'market_news',
  'alpha_vantage_news',
  'alpaca_news',
  'finnhub_news',
  'polygon_news',
];
const MACRO_KINDS: ResearchSourceKindT[] = [
  'fred_macro',
  'frankfurter_fx',
  'coingecko_crypto',
  'world_bank_indicator',
];
const WEB_KINDS: ResearchSourceKindT[] = ['brave_search', 'sec_edgar'];
const BAR_KINDS: ResearchSourceKindT[] = ['alpaca_bars', 'twelve_data', 'marketstack'];

function domainCountBand(n: number): 'absent' | 'single' | 'dual' | 'multi' {
  if (n >= 3) return 'multi';
  if (n === 2) return 'dual';
  if (n === 1) return 'single';
  return 'absent';
}

function buildMoversReportBody(opts: {
  corroborationBand: string;
  itemHeadlines: string[];
  feedClass: string;
  thresholdSource: string;
  sourceKinds: string[];
}): string {
  const notes =
    opts.itemHeadlines.length > 0
      ? opts.itemHeadlines.map((h) => `- ${h}`).join('\n')
      : '- No multi-source leadership cluster sealed this window; lenses remain authoritative.';

  const sources =
    opts.sourceKinds.length > 0
      ? opts.sourceKinds.map((k) => `- ${k.replace(/_/g, ' ')}`).join('\n')
      : '- No entitled provider surfaces contributed this window.';

  return [
    '# Daily movers report',
    '',
    '## Scan window',
    '',
    `Paper scan via ${opts.feedClass} with corroboration band ${opts.corroborationBand}.`,
    `Threshold profile source: ${opts.thresholdSource}.`,
    'Values stay on the ValueRef path; this report is qualitative only.',
    '',
    '## Provider surfaces pulled',
    '',
    sources,
    '',
    '## Leadership notes',
    '',
    notes,
    '',
    'Cross-check [[relative_strength_leaders]] before admitting sympathy names.',
    '',
    '## Related lenses',
    '',
    'Pair with [[volume_expansion_watch]] and [[sector_rotation_signal]] when rotation context matters.',
  ].join('\n');
}

function packagesForSymbol(pkgs: EvidencePackage[], symbol: string): EvidencePackage[] {
  const u = symbol.toUpperCase();
  return pkgs.filter(
    (p) =>
      p.title.toUpperCase().includes(u) ||
      p.summary.toUpperCase().includes(u) ||
      (p.externalRef?.toUpperCase().includes(u) ?? false),
  );
}

registerHandler('library.system_movers', async ({ db, clock, job, modelGateway }) => {
  const payload = SystemMoversPayload.parse(job.payload);
  const now = new Date(clock.nowMs());
  const nowMs = clock.nowMs();
  const runId = payload.synthesisRunId;
  const jobId = job.id;

  const stage = async (
    stageId: Parameters<typeof recordSynthesisStage>[1]['stageId'],
    status: Parameters<typeof recordSynthesisStage>[1]['status'],
    summary?: string,
    justificationLines?: string[],
  ) => {
    if (!runId) return;
    await recordSynthesisStage(db, {
      runId,
      companyId: payload.companyId,
      stageId,
      status,
      summary: summary ?? null,
      ...(justificationLines !== undefined ? { justificationLines } : {}),
      jobId,
      now: new Date(clock.nowMs()),
    });
  };

  await stage('providers', 'running', 'Resolving entitled gather lanes');
  await stage('providers', 'succeeded', 'Credential-ready / public lanes selected', [
    'D-103: gather only ready lanes',
  ]);

  const libraryId = await ensureSystemLibrary(db, payload.companyId, SystemTopicScope.MOVERS, now, {
    refreshPlaceholders: true,
  });

  const entry = getSystemLibraryEntry(SystemTopicScope.MOVERS);
  if (!entry) {
    await stage('gather', 'failed', 'Movers library registry missing');
    return;
  }

  const companyModules = await db
    .select({
      id: modules.id,
      type: modules.type,
      topicSectors: modules.topicSectors,
      config: modules.config,
    })
    .from(modules)
    .where(eq(modules.companyId, payload.companyId));

  const ownerModuleId =
    companyModules.find((m) => m.type === 'research')?.id ??
    companyModules.find((m) => m.type === 'librarian')?.id ??
    companyModules.find((m) => m.type === 'library')?.id ??
    companyModules.find((m) => m.type === 'math')?.id;
  if (!ownerModuleId) {
    await stage('gather', 'failed', 'No research/library module to own seals');
    return;
  }

  const topicSectors =
    companyModules.find((m) => (m.topicSectors?.length ?? 0) > 0)?.topicSectors ?? [];

  await ensureSectorKnowledge(db, payload.companyId, now);

  const subjectKey = 'daily';
  const existingSeal = await loadLatestValidSeal(db, {
    companyId: payload.companyId,
    kind: 'movers_board',
    subjectKey,
    nowMs,
  });

  const [company] = await db
    .select({
      philosophyProfile: companies.philosophyProfile,
      clerkUserId: companies.clerkUserId,
    })
    .from(companies)
    .where(eq(companies.id, payload.companyId))
    .limit(1);

  const philosophy = resolvePhilosophyControl({
    philosophyProfile: company?.philosophyProfile ?? {},
  });
  const axisLabels = Object.keys(philosophy.philosophyProfile.axes ?? {}).slice(0, 16);

  const gatherCredentials = await resolveResearchGatherCredentials(db, payload.companyId);

  const plan = buildResearchQueryPlan({
    topicScope: SystemTopicScope.MOVERS,
    topicSectors,
    queryText: 'cross sectional leadership movers relative strength',
    cadence: 'every:1440',
  });

  // Only pull from operator-provided / public-ready surfaces (D-103).
  const sourceKinds = selectReadyLaneSourceKinds(gatherCredentials, MOVERS_LANE_SOURCE_KINDS);

  await stage('gather', 'running', 'Gathering entitled evidence packages');
  const { packages: gathered } = await gatherEvidencePackages({
    query: plan.baseQuery,
    queryBySource: plan.bySource,
    sourceKinds,
    allowlist: [],
    blocklist: [],
    maxEvidence: 32,
    marketNewsAllowDeterministicFallback: false,
    ...gatherCredentials,
  });

  const usable = gathered.filter(
    (pkg) =>
      pkg.legalUseClass === 'ALLOWED' &&
      !pkg.feedClass.includes('stub') &&
      !pkg.feedClass.includes('public_stub'),
  );
  await stage(
    'gather',
    'succeeded',
    `Gathered ${usable.length} usable packages across ${sourceKinds.length} ready kinds`,
    ['Model-free gather; stubs excluded'],
  );

  const domains = new Set(usable.map((p) => p.sourceKind));
  const hasNews = usable.some((p) => NEWS_KINDS.includes(p.sourceKind as ResearchSourceKind));
  const hasMacro = usable.some((p) => MACRO_KINDS.includes(p.sourceKind as ResearchSourceKind));
  const hasWeb = usable.some((p) => WEB_KINDS.includes(p.sourceKind as ResearchSourceKind));
  const hasBars = usable.some((p) => BAR_KINDS.includes(p.sourceKind as ResearchSourceKind));

  const libraryIds = await listCompanyLibraryIds(db, payload.companyId, [
    SystemTopicScope.MOVERS,
    ...topicSectors.map((s) => `sector:${s}`),
    'sector',
  ]);
  // Also include any active library ids when topic scopes miss.
  if (libraryIds.length === 0) {
    const allIds = await listCompanyLibraryIds(db, payload.companyId, []);
    libraryIds.push(...allIds.slice(0, 8));
  }
  const corpus = await loadMoversLibraryCorpus(db, payload.companyId, [
    libraryId,
    ...libraryIds,
  ].slice(0, 12));
  const hasLibraryCorpus = corpus.texts.length > 0;

  const lanePresence = {
    hasMarketBars: hasBars || Boolean(gatherCredentials.alpacaKeyId),
    hasNews,
    hasMacro,
    hasFilingsOrWeb: hasWeb,
    hasLibraryCorpus,
    domainCount: domains.size,
    sessionPhase: 'scan',
  };

  let profile: SuggestionThresholdProfile | null = null;
  let thresholdSource: 'llm_profile' | 'typical_defaults' = 'typical_defaults';

  await stage('thresholds', 'running', 'Proposing tactical threshold profile');
  if (modelGateway && process.env.HFTR_LLM_MODE !== 'deterministic') {
    const llm = await modelGateway.proposeSuggestionThresholds({
      companyId: payload.companyId,
      moduleId: ownerModuleId,
      jobId: job.id,
      philosophyAxisLabels: axisLabels,
      libraryLensTitles: corpus.titles.slice(0, 24),
      sectorFocuses: topicSectors,
      lanePresence: {
        hasMarketBars: lanePresence.hasMarketBars,
        hasNews: lanePresence.hasNews,
        hasMacro: lanePresence.hasMacro,
        hasFilingsOrWeb: lanePresence.hasFilingsOrWeb,
        hasLibraryCorpus: lanePresence.hasLibraryCorpus,
        domainCountBand: domainCountBand(lanePresence.domainCount),
      },
      sessionPhase: 'scan',
    });
    if (llm.ok) {
      profile = llm.profile;
      thresholdSource = 'llm_profile';
    }
  }

  if (!profile) {
    // Fail-closed: typical defaults (catalog anchors). Heuristic kept for audit note only.
    void proposeThresholdProfileHeuristic(lanePresence);
    profile = null;
    await stage('thresholds', 'skipped', 'LLM unavailable — using typical defaults path');
    await stage('defaults', 'succeeded', 'Typical catalog defaults resolved', [
      'Fail-closed when tactical LLM unavailable',
    ]);
  } else {
    await stage('thresholds', 'succeeded', 'Tactical LLM threshold profile accepted', [
      'sourceClass: llm_profile',
      'suggestion_threshold_profile.v1',
    ]);
    await stage('defaults', 'skipped', 'LLM profile superseded typical defaults');
  }

  const thresholds = resolveSuggestionThresholds({
    profile,
    evidenceBarMax: philosophy.philosophyProfile.axes.evidence_bar === 'max',
    breadthBias:
      philosophy.philosophyProfile.axes.research_breadth === 'min'
        ? 'min'
        : philosophy.philosophyProfile.axes.research_breadth === 'max'
          ? 'max'
          : 'typical',
    sourceClass: thresholdSource,
  });

  const positionRows = await db
    .select({ symbol: positions.symbol })
    .from(positions)
    .where(eq(positions.companyId, payload.companyId))
    .limit(40);

  const trendRows = await db
    .select({ symbol: trendCandidates.symbol, status: trendCandidates.status })
    .from(trendCandidates)
    .where(
      and(eq(trendCandidates.companyId, payload.companyId), ne(trendCandidates.status, 'expired')),
    )
    .limit(40);

  const evidenceTexts = usable.map((p) => `${p.title} ${p.summary}`);
  const evidenceSymbols = extractTickerCandidates(evidenceTexts, 16);

  await stage('universe', 'running');
  const universe = buildMoversUniverse({
    sectorPeers: [],
    evidenceSymbols,
    trendSymbols: trendRows.map((t) => t.symbol),
    positionSymbols: positionRows.map((p) => p.symbol),
    fallbackLiquid: DEFAULT_LIQUID_FALLBACK,
    universeCap: thresholds.universeCap,
  });
  await stage(
    'universe',
    'succeeded',
    `Universe size ${universe.length} (cap ${thresholds.universeCap})`,
    ['Evidence + trends + book + liquid fallback'],
  );

  const openBook = new Set(positionRows.map((p) => p.symbol.toUpperCase()));
  const bookAtCap = openBook.size >= Math.max(4, Math.floor(thresholds.suggestionCap / 2));

  const newsPkgs = usable.filter((p) => NEWS_KINDS.includes(p.sourceKind as ResearchSourceKind) || WEB_KINDS.includes(p.sourceKind as ResearchSourceKind));
  const macroPkgs = usable.filter((p) => MACRO_KINDS.includes(p.sourceKind as ResearchSourceKind));
  const newsCorpus = newsPkgs.map((p) => `${p.title}\n${p.summary}`);
  const macroCorpus = macroPkgs.map((p) => `${p.title}\n${p.summary}`);

  type BarSnap = { closes: number[]; volumes: number[] };
  const barBySymbol = new Map<string, BarSnap>();

  if (gatherCredentials.alpacaKeyId && gatherCredentials.alpacaSecret) {
    const creds = {
      keyId: gatherCredentials.alpacaKeyId,
      secret: gatherCredentials.alpacaSecret,
    };
    for (const symbol of universe.slice(0, thresholds.universeCap)) {
      try {
        const result = await fetchBars({
          symbol,
          limit: 12,
          timeframe: '15Min',
          credentials: creds,
        });
        if (result.bars.length >= 2) {
          barBySymbol.set(symbol, {
            closes: result.bars.map((b) => b.close),
            volumes: result.bars.map((b) => b.volume),
          });
        }
      } catch {
        // Soft-fail per symbol.
      }
    }
  }

  const spyBars = barBySymbol.get('SPY') ?? null;
  await stage('rs', 'running', 'Computing relative strength vs SPY');
  const scores = [];
  for (const symbol of universe) {
    const snap = barBySymbol.get(symbol) ?? { closes: [], volumes: [] };
    const rs = computeRelStrength(snap, spyBars, thresholds.flatBps);
    const symPkgs = packagesForSymbol(usable, symbol);
    const domainSet = new Set(symPkgs.map((p) => p.sourceKind));
    // Bars entitlement alone counts as one domain when OHLC present.
    if (barBySymbol.has(symbol)) domainSet.add('alpaca_bars');
    if (corpus.texts.length > 0) domainSet.add('library');

    scores.push(
      scoreCompoundSymbol(
        {
          symbol,
          relStrengthAbsBps: rs.relStrengthAbsBps,
          direction: rs.direction,
          volumeExpansionRatio: rs.volumeExpansionRatio,
          corroborationDomains: domainSet.size,
          libraryQueryText: `${symbol} ${topicSectors.join(' ')} movers leadership`,
          corpusTexts: corpus.texts,
          newsCorpusTexts: newsCorpus,
          macroCorpusTexts: macroCorpus,
          bookAtCap,
          inOpenBook: openBook.has(symbol),
        },
        thresholds,
      ),
    );
  }

  await stage('rs', 'succeeded', `Scored ${scores.length} symbols`, [
    'Model-free bars vs SPY · synthetic marks when needed',
  ]);
  await stage('rank', 'running');
  const ranked = rankCompoundScores(scores);
  const topK = ranked.slice(0, Math.min(8, thresholds.suggestionCap));
  await stage('rank', 'succeeded', `Ranked top ${topK.length} for board`, [
    'Leadership · fit · corroboration bands',
  ]);

  // Watchlist module: prefer trading/trend for operator confirm UX.
  const watchModuleId =
    companyModules.find((m) => m.type === 'trading')?.id ??
    companyModules.find((m) => m.type === 'trend')?.id ??
    ownerModuleId;

  await upsertMoversRankSuggestions({
    db,
    companyId: payload.companyId,
    moduleId: watchModuleId,
    scores: ranked,
    suggestionCap: thresholds.suggestionCap,
    now,
  });

  await stage('verify', 'running');
  const verifiedSymbols: string[] = [];
  for (const score of ranked) {
    if (!score.admitsSearch) continue;
    const gates = evaluateSuggestionVerifyGates({
      score,
      thresholds,
      universe,
      evidenceScannedAtMs: nowMs,
      nowMs,
      regimeTrendUp: null,
    });
    if (suggestionVerifyPasses(gates)) {
      verifiedSymbols.push(score.symbol);
    }
  }

  await promoteVerifiedSuggestions({
    db,
    companyId: payload.companyId,
    moduleId: watchModuleId,
    symbols: verifiedSymbols.slice(0, thresholds.suggestionCap),
    now,
    noteSuffix: `Verified (${thresholdSource}; corroboration floor ${thresholds.corroborationMinDomains}).`,
  });
  await stage(
    'verify',
    'succeeded',
    `Promoted ${Math.min(verifiedSymbols.length, thresholds.suggestionCap)} verified suggestions`,
    ['Suggestion verify → watchlist promote'],
  );

  if (existingSeal && !payload.forceReseal) {
    // Seal still valid — suggestions refreshed; skip re-seal.
    await stage('seal_movers', 'skipped', 'Valid movers seal retained; suggestions refreshed');
    return;
  }

  await stage('seal_movers', 'running');

  const evidence: EvidencePackage[] = [...usable];
  evidence.push(
    normalizeToEvidencePackage({
      sourceKind: 'catalog',
      feedClass: 'system_movers_rank',
      title: 'Cross-sectional leadership scan',
      summary:
        'Model-free relative strength and participation ranking across the paper movers universe. Bands only.',
      externalRef: null,
      authorityClass: 'DETERMINISTIC',
      legalUseClass: 'ALLOWED',
      expiresAt: new Date(nowMs + thresholds.freshnessWindowMs).toISOString(),
    }),
  );
  if (corpus.titles.length > 0) {
    evidence.push(
      normalizeToEvidencePackage({
        sourceKind: 'library',
        feedClass: 'system_movers_rank',
        title: 'Movers library corpus',
        summary: `Hydrated ${corpus.titles.length} admitted library lenses for compound fit.`,
        authorityClass: 'CURATED_BACKGROUND',
        legalUseClass: 'ALLOWED',
        expiresAt: new Date(nowMs + thresholds.freshnessWindowMs).toISOString(),
      }),
    );
  }

  const bundle = corroborateAndNormalize({
    evidence,
    kind: 'movers_board',
    subjectKey,
    title: 'Daily movers board',
    nowMs,
    topicScope: SystemTopicScope.MOVERS,
    topicSectors,
  });
  if (!bundle) {
    await stage('seal_movers', 'failed', 'Corroboration failed — no movers seal');
    return;
  }

  // Overlay compound-ranked symbols onto sealed view items (symbolOrSector).
  bundle.view.items = topK.map((s) => ({
    headline: `${s.symbol} leadership ${s.leadershipBand}; corroboration ${s.corroborationBand}`,
    symbolOrSector: s.symbol,
    directionBand:
      s.direction === 'flat' ? ('low' as const) : s.leadershipBand,
    strengthBand: s.leadershipBand,
  }));

  const contributed = [
    ...new Set([
      ...usable.map((p) => p.sourceKind),
      ...evidence.map((p) => p.sourceKind),
    ]),
  ].filter((k): k is ResearchSourceKindT => ResearchSourceKind.safeParse(k).success);
  bundle.contributingSourceKinds = contributed.slice(0, 24);

  const itemHeadlines = bundle.view.items
    .map((item) => item.headline ?? item.symbolOrSector ?? '')
    .filter((h) => h.length > 0)
    .slice(0, 8);

  const feedClass =
    usable.find((p) => p.sourceKind === 'alpaca_bars')?.feedClass ?? 'system_movers_rank';

  const reportBody = buildMoversReportBody({
    corroborationBand: bundle.corroborationBand,
    itemHeadlines,
    feedClass,
    thresholdSource,
    sourceKinds: bundle.contributingSourceKinds ?? [],
  });

  await persistVerifiedBundle({
    db,
    companyId: payload.companyId,
    moduleId: ownerModuleId,
    bundle,
    reportBody,
    reportTitle: 'daily_movers_report',
    libraryId,
    ownerModuleId,
    tags: entry.kindTags,
    now,
  });
  await stage('seal_movers', 'succeeded', `Sealed movers board (${bundle.corroborationBand})`, [
    'Verified normalize · report concept dual-persist',
  ]);
});
