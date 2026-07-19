/**
 * Route-granular process step catalog for Market Posture Model (D-162 / D-169).
 * Mirrors movers/sector/daily handler routes — each API family has its own
 * fetch → normalize → analyze chain instead of dumping into generic stages.
 */

import type {
  MarketHubModelLiveSource,
  MarketHubModelProcessStep,
  MarketHubModelProcessingFlow,
  MarketHubSynthesisStageId,
} from '@hftr/contracts';

export type ProcessRouteId =
  | 'news_headline'
  | 'web_search'
  | 'filings'
  | 'macro_context'
  | 'fx_context'
  | 'crypto_context'
  | 'bars_entitle'
  | 'bars_ohlc'
  | 'library_jaccard'
  | 'providers_entitle'
  | 'thresholds_llm'
  | 'defaults_catalog'
  | 'universe_build'
  | 'compound_rank'
  | 'verify_promote'
  | 'sector_bulletin'
  | 'daily_phase'
  | 'narrative_compose';

type StepTemplate = {
  suffix: string;
  label: string;
  operation: string;
  analysisRole: string;
  processFunction: MarketHubModelProcessStep['processFunction'];
};

type RouteDef = {
  route: ProcessRouteId;
  pipelines: Array<'movers' | 'sector' | 'daily' | 'compose'>;
  feedStages: MarketHubSynthesisStageId[];
  steps: StepTemplate[];
};

/** Per-API route families (live hydrators). */
const KIND_ROUTE: Record<string, ProcessRouteId> = {
  gdelt_news: 'news_headline',
  market_news: 'news_headline',
  alpha_vantage_news: 'news_headline',
  alpaca_news: 'news_headline',
  finnhub_news: 'news_headline',
  polygon_news: 'news_headline',
  brave_search: 'web_search',
  sec_edgar: 'filings',
  fred_macro: 'macro_context',
  world_bank_indicator: 'macro_context',
  frankfurter_fx: 'fx_context',
  coingecko_crypto: 'crypto_context',
  twelve_data: 'bars_entitle',
  marketstack: 'bars_entitle',
};

const ROUTE_DEFS: Record<ProcessRouteId, RouteDef> = {
  news_headline: {
    route: 'news_headline',
    pipelines: ['movers', 'sector'],
    feedStages: ['gather', 'universe', 'seal_movers', 'sector'],
    steps: [
      { suffix: 'fetch', label: 'Headline fetch', operation: 'API/DOC pull', analysisRole: 'news_corpus', processFunction: 'fetch' },
      { suffix: 'normalize', label: 'Package normalize', operation: 'legal + feedClass', analysisRole: 'normalize', processFunction: 'normalize' },
      { suffix: 'tickers', label: 'Ticker extract', operation: 'universe seeds', analysisRole: 'universe_tickers', processFunction: 'extract' },
      { suffix: 'corroborate', label: 'News corroborate', operation: 'domain band', analysisRole: 'corroboration', processFunction: 'corroborate' },
    ],
  },
  web_search: {
    route: 'web_search',
    pipelines: ['movers', 'sector'],
    feedStages: ['gather', 'seal_movers', 'sector'],
    steps: [
      { suffix: 'fetch', label: 'Web search fetch', operation: 'Brave query', analysisRole: 'web_corpus', processFunction: 'fetch' },
      { suffix: 'normalize', label: 'Web normalize', operation: 'legal + feedClass', analysisRole: 'normalize', processFunction: 'normalize' },
      { suffix: 'corroborate', label: 'Web corroborate', operation: 'domain band', analysisRole: 'corroboration', processFunction: 'corroborate' },
    ],
  },
  filings: {
    route: 'filings',
    pipelines: ['movers'],
    feedStages: ['gather', 'seal_movers'],
    steps: [
      { suffix: 'fetch', label: 'EDGAR fetch', operation: 'filings pull', analysisRole: 'filings_corpus', processFunction: 'fetch' },
      { suffix: 'normalize', label: 'Filings normalize', operation: 'legal + feedClass', analysisRole: 'normalize', processFunction: 'normalize' },
      { suffix: 'corroborate', label: 'Filings corroborate', operation: 'domain band', analysisRole: 'corroboration', processFunction: 'corroborate' },
    ],
  },
  macro_context: {
    route: 'macro_context',
    pipelines: ['movers'],
    feedStages: ['gather', 'rank', 'seal_movers'],
    steps: [
      { suffix: 'fetch', label: 'Macro fetch', operation: 'series pull', analysisRole: 'macro_context', processFunction: 'fetch' },
      { suffix: 'normalize', label: 'Macro normalize', operation: 'legal + feedClass', analysisRole: 'normalize', processFunction: 'normalize' },
      { suffix: 'context', label: 'Macro context score', operation: 'compound context', analysisRole: 'corroboration', processFunction: 'context' },
    ],
  },
  fx_context: {
    route: 'fx_context',
    pipelines: ['movers'],
    feedStages: ['gather', 'rank', 'seal_movers'],
    steps: [
      { suffix: 'fetch', label: 'FX fetch', operation: 'rate pull', analysisRole: 'macro_context', processFunction: 'fetch' },
      { suffix: 'normalize', label: 'FX normalize', operation: 'legal + feedClass', analysisRole: 'normalize', processFunction: 'normalize' },
      { suffix: 'context', label: 'FX context', operation: 'compound context', analysisRole: 'corroboration', processFunction: 'context' },
    ],
  },
  crypto_context: {
    route: 'crypto_context',
    pipelines: ['movers'],
    feedStages: ['gather', 'rank', 'seal_movers'],
    steps: [
      { suffix: 'fetch', label: 'Crypto fetch', operation: 'market pull', analysisRole: 'macro_context', processFunction: 'fetch' },
      { suffix: 'normalize', label: 'Crypto normalize', operation: 'legal + feedClass', analysisRole: 'normalize', processFunction: 'normalize' },
      { suffix: 'context', label: 'Crypto context', operation: 'compound context', analysisRole: 'corroboration', processFunction: 'context' },
    ],
  },
  bars_entitle: {
    route: 'bars_entitle',
    pipelines: ['movers'],
    feedStages: ['providers', 'gather', 'verify'],
    steps: [
      { suffix: 'entitle', label: 'Bars entitlement', operation: 'credential lane', analysisRole: 'bars_entitlement', processFunction: 'entitle' },
      { suffix: 'announce', label: 'Lane announce', operation: 'providers ready', analysisRole: 'corroboration', processFunction: 'announce' },
    ],
  },
  bars_ohlc: {
    route: 'bars_ohlc',
    pipelines: ['movers'],
    feedStages: ['rs', 'rank'],
    steps: [
      { suffix: 'fetch', label: 'OHLC fetch', operation: '15Min bars', analysisRole: 'bars_fetch', processFunction: 'fetch' },
      { suffix: 'rs', label: 'RS vs SPY', operation: 'rel strength', analysisRole: 'relative_strength', processFunction: 'score' },
      { suffix: 'volume', label: 'Volume expand', operation: 'participation', analysisRole: 'volume_expansion', processFunction: 'score' },
    ],
  },
  library_jaccard: {
    route: 'library_jaccard',
    pipelines: ['movers'],
    feedStages: ['thresholds', 'rank', 'seal_movers'],
    steps: [
      { suffix: 'load', label: 'Corpus load', operation: 'admitted lenses', analysisRole: 'library_jaccard', processFunction: 'load' },
      { suffix: 'jaccard', label: 'Jaccard fit', operation: 'compound fit', analysisRole: 'corroboration', processFunction: 'corroborate' },
    ],
  },
  providers_entitle: {
    route: 'providers_entitle',
    pipelines: ['movers', 'sector'],
    feedStages: ['providers', 'gather'],
    steps: [
      { suffix: 'select', label: 'Select ready lanes', operation: 'credential intersect', analysisRole: 'entitle', processFunction: 'entitle' },
      { suffix: 'rollup', label: 'Entitle rollup', operation: 'providers → gather', analysisRole: 'entitle', processFunction: 'entitle' },
    ],
  },
  thresholds_llm: {
    route: 'thresholds_llm',
    pipelines: ['movers'],
    feedStages: ['thresholds', 'universe'],
    steps: [
      { suffix: 'lane_presence', label: 'Lane presence', operation: 'bars/news/macro flags', analysisRole: 'thresholds', processFunction: 'thresholds' },
      { suffix: 'propose', label: 'LLM threshold propose', operation: 'ints only', analysisRole: 'thresholds', processFunction: 'thresholds' },
    ],
  },
  defaults_catalog: {
    route: 'defaults_catalog',
    pipelines: ['movers'],
    feedStages: ['defaults', 'universe'],
    steps: [
      { suffix: 'typical', label: 'Typical defaults', operation: 'fail-closed bands', analysisRole: 'defaults', processFunction: 'defaults' },
    ],
  },
  universe_build: {
    route: 'universe_build',
    pipelines: ['movers'],
    feedStages: ['universe', 'rs'],
    steps: [
      { suffix: 'evidence', label: 'Evidence tickers', operation: 'news seeds', analysisRole: 'universe', processFunction: 'extract' },
      { suffix: 'book_merge', label: 'Book + trend merge', operation: 'held + candidates', analysisRole: 'universe', processFunction: 'extract' },
      { suffix: 'cap', label: 'Universe cap', operation: 'liquid fallback', analysisRole: 'universe', processFunction: 'extract' },
    ],
  },
  compound_rank: {
    route: 'compound_rank',
    pipelines: ['movers'],
    feedStages: ['rank', 'verify'],
    steps: [
      { suffix: 'score', label: 'Compound score', operation: 'RS + corroboration + fit', analysisRole: 'rank', processFunction: 'rank' },
      { suffix: 'sort', label: 'Leadership sort', operation: 'top-K board', analysisRole: 'rank', processFunction: 'rank' },
    ],
  },
  verify_promote: {
    route: 'verify_promote',
    pipelines: ['movers'],
    feedStages: ['verify', 'seal_movers'],
    steps: [
      { suffix: 'gates', label: 'Verify gates', operation: 'admit / hold', analysisRole: 'verify', processFunction: 'verify' },
      { suffix: 'promote', label: 'Watch promote', operation: 'suggestion → watching', analysisRole: 'verify', processFunction: 'verify' },
    ],
  },
  sector_bulletin: {
    route: 'sector_bulletin',
    pipelines: ['sector'],
    feedStages: ['sector', 'narrative'],
    steps: [
      { suffix: 'gather', label: 'Sector headline gather', operation: 'sector lanes', analysisRole: 'news_corpus', processFunction: 'fetch' },
      { suffix: 'corroborate', label: 'Sector corroborate', operation: 'multi-source band', analysisRole: 'corroboration', processFunction: 'corroborate' },
      { suffix: 'seal', label: 'Bulletin seal', operation: 'persist news board', analysisRole: 'seal', processFunction: 'seal' },
    ],
  },
  daily_phase: {
    route: 'daily_phase',
    pipelines: ['daily'],
    feedStages: ['daily', 'narrative'],
    steps: [
      { suffix: 'calendar', label: 'Calendar phase', operation: 'session window', analysisRole: 'daily', processFunction: 'seal' },
      { suffix: 'seal', label: 'Daily seal', operation: 'persist summary', analysisRole: 'seal', processFunction: 'seal' },
    ],
  },
  narrative_compose: {
    route: 'narrative_compose',
    pipelines: ['compose'],
    feedStages: ['narrative', 'hub_ready'],
    steps: [
      { suffix: 'book_tape', label: 'Book↔tape crosswalk', operation: 'held / watch / pipeline', analysisRole: 'narrative', processFunction: 'compose' },
      { suffix: 'rollup', label: 'Narrative rollup', operation: 'seal-grounded', analysisRole: 'narrative', processFunction: 'compose' },
    ],
  },
};

type AdapterFlowTemplate = {
  idSuffix: string;
  adapterLabel: string;
  route: ProcessRouteId;
  /** Dual-route kinds (alpaca) override KIND_ROUTE. */
  pipelines?: Array<'movers' | 'sector'>;
};

const ADAPTER_FLOWS: Record<string, AdapterFlowTemplate[]> = {
  gdelt_news: [{ idSuffix: 'headline', adapterLabel: 'GDELT DOC adapter', route: 'news_headline' }],
  market_news: [
    { idSuffix: 'headline', adapterLabel: 'Market news adapter', route: 'news_headline' },
  ],
  alpha_vantage_news: [
    { idSuffix: 'headline', adapterLabel: 'Alpha Vantage news adapter', route: 'news_headline' },
  ],
  alpaca_news: [
    { idSuffix: 'headline', adapterLabel: 'Alpaca news adapter', route: 'news_headline' },
  ],
  finnhub_news: [
    { idSuffix: 'headline', adapterLabel: 'Finnhub news adapter', route: 'news_headline' },
  ],
  polygon_news: [
    { idSuffix: 'headline', adapterLabel: 'Polygon news adapter', route: 'news_headline' },
  ],
  brave_search: [{ idSuffix: 'web', adapterLabel: 'Brave web adapter', route: 'web_search' }],
  sec_edgar: [{ idSuffix: 'filings', adapterLabel: 'SEC EDGAR adapter', route: 'filings' }],
  fred_macro: [{ idSuffix: 'macro', adapterLabel: 'FRED macro adapter', route: 'macro_context' }],
  world_bank_indicator: [
    { idSuffix: 'macro', adapterLabel: 'World Bank adapter', route: 'macro_context' },
  ],
  frankfurter_fx: [{ idSuffix: 'fx', adapterLabel: 'Frankfurter FX adapter', route: 'fx_context' }],
  coingecko_crypto: [
    { idSuffix: 'crypto', adapterLabel: 'CoinGecko adapter', route: 'crypto_context' },
  ],
  alpaca_bars: [
    { idSuffix: 'entitle', adapterLabel: 'Alpaca bars entitle', route: 'bars_entitle' },
    { idSuffix: 'ohlc', adapterLabel: 'Alpaca OHLC adapter', route: 'bars_ohlc' },
  ],
  twelve_data: [
    { idSuffix: 'entitle', adapterLabel: 'Twelve Data entitle', route: 'bars_entitle' },
    { idSuffix: 'ohlc', adapterLabel: 'Twelve Data OHLC adapter', route: 'bars_ohlc' },
  ],
  marketstack: [
    { idSuffix: 'entitle', adapterLabel: 'Marketstack entitle', route: 'bars_entitle' },
    { idSuffix: 'ohlc', adapterLabel: 'Marketstack OHLC adapter', route: 'bars_ohlc' },
  ],
};

function amountForStatus(opts: {
  contributed: boolean;
  status: MarketHubModelLiveSource['status'];
  canvasBoundCount: number;
  route: ProcessRouteId;
}): string {
  if (opts.status === 'missing_key') return 'need key';
  if (opts.status === 'stub' || opts.status === 'researched') return opts.status;
  if (opts.contributed) return 'sealed contrib';
  if (opts.route === 'bars_ohlc') {
    return opts.status === 'ready' || opts.status === 'public' ? 'RS path' : 'idle';
  }
  if (opts.canvasBoundCount > 0) return `${opts.canvasBoundCount} canvas`;
  if (opts.status === 'ready' || opts.status === 'public') return 'ready';
  return 'idle';
}

function stepId(kind: string, suffix: string): string {
  return `${kind}:${suffix}`.slice(0, 80);
}

function kindShort(kind: string): string {
  const base = kind.startsWith('library:') ? kind.slice('library:'.length) : kind;
  return base.replace(/_/g, ' ').slice(0, 28);
}

function buildStepsForKind(opts: {
  kind: string;
  route: ProcessRouteId;
  status: MarketHubModelProcessStep['status'];
  amount: string;
}): MarketHubModelProcessStep[] {
  const def = ROUTE_DEFS[opts.route];
  const prefix = kindShort(opts.kind);
  return def.steps.map((s, i) => ({
    id: stepId(opts.kind, s.suffix),
    route: opts.route,
    label: `${prefix} · ${s.label}`.slice(0, 120),
    operation: s.operation.slice(0, 80),
    amount: opts.amount.slice(0, 40),
    analysisRole: s.analysisRole.slice(0, 40),
    processFunction: s.processFunction,
    sortOrder: i,
    kind: opts.kind.slice(0, 80),
    pipelines: [...def.pipelines],
    feedStages: [...def.feedStages],
    status: opts.status,
  }));
}

/**
 * Build per-API processingFlows with route + ordered processStepIds (D-162).
 */
export function buildLiveProcessingFlows(
  liveSources: MarketHubModelLiveSource[],
): MarketHubModelProcessingFlow[] {
  const out: MarketHubModelProcessingFlow[] = [];
  for (const src of liveSources) {
    const flows = ADAPTER_FLOWS[src.kind];
    if (!flows) continue;
    for (const flow of flows) {
      const def = ROUTE_DEFS[flow.route];
      const amount = amountForStatus({
        contributed: src.contributed,
        status: src.status,
        canvasBoundCount: src.canvasBoundCount,
        route: flow.route,
      });
      const processStepIds = def.steps.map((s) => stepId(src.kind, s.suffix));
      out.push({
        id: `${src.kind}:${flow.idSuffix}`.slice(0, 80),
        kind: src.kind,
        adapterLabel: flow.adapterLabel.slice(0, 120),
        analysisRoles: def.steps.map((s) => s.analysisRole).slice(0, 8),
        operation: def.steps[0]?.operation.slice(0, 80) ?? flow.idSuffix,
        amount: amount.slice(0, 40),
        route: flow.route,
        processStepIds,
        targetStages: def.feedStages,
        pipelines: (flow.pipelines ?? def.pipelines.filter((p) => p === 'movers' || p === 'sector')) as Array<
          'movers' | 'sector'
        >,
        status: src.status,
        contributed: src.contributed,
      });
    }
  }
  return out.slice(0, 64);
}

/**
 * Library corpus flows — Jaccard route steps.
 */
export function buildLibraryProcessingFlows(opts: {
  libraryId: string;
  name: string;
  admittedCount: number;
  shelf: string;
}): MarketHubModelProcessingFlow[] {
  const kind = `library:${opts.libraryId}`.slice(0, 80);
  const def = ROUTE_DEFS.library_jaccard;
  const amount = opts.admittedCount > 0 ? `${opts.admittedCount} lenses` : 'empty corpus';
  const processStepIds = def.steps.map((s) => stepId(kind, s.suffix));
  return [
    {
      id: `${kind}:jaccard`.slice(0, 80),
      kind,
      adapterLabel: `Corpus Jaccard · ${opts.name}`.slice(0, 120),
      analysisRoles: ['library_jaccard', 'corroboration'],
      operation: opts.shelf === 'system' ? 'system corpus' : 'library feed',
      amount: amount.slice(0, 40),
      route: 'library_jaccard',
      processStepIds,
      targetStages: def.feedStages,
      pipelines: ['movers'],
      status: opts.admittedCount > 0 ? 'ready' : 'idle',
      contributed: opts.admittedCount > 0,
    },
  ];
}

/**
 * Expand flows into granular processSteps (per-kind route chains).
 */
export function buildProcessStepsFromFlows(
  flows: MarketHubModelProcessingFlow[],
): MarketHubModelProcessStep[] {
  const out: MarketHubModelProcessStep[] = [];
  const seen = new Set<string>();
  for (const flow of flows) {
    const route = (flow.route ?? KIND_ROUTE[flow.kind] ?? 'news_headline') as ProcessRouteId;
    if (!ROUTE_DEFS[route]) continue;
    const steps = buildStepsForKind({
      kind: flow.kind,
      route,
      status: flow.status,
      amount: flow.amount,
    });
    for (const s of steps) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

/**
 * Shared compound process steps (not per-API) — universe / rank / verify / etc.
 */
export function buildSharedCompoundProcessSteps(opts: {
  liveReady: number;
  liveTotal: number;
  moversItemCount: number;
  newsItemCount: number;
  watchlistCount: number;
  positionCount: number;
  admittedConcepts: number;
  usedLiveMarks: number;
  syntheticMarks: number;
}): MarketHubModelProcessStep[] {
  const shared: Array<{ route: ProcessRouteId; amount: string; status: MarketHubModelProcessStep['status'] }> =
    [
      {
        route: 'providers_entitle',
        amount: `${opts.liveReady}/${opts.liveTotal} ready`,
        status: opts.liveReady > 0 ? 'ready' : 'idle',
      },
      {
        route: 'thresholds_llm',
        amount: 'ints only',
        status: 'ready',
      },
      {
        route: 'defaults_catalog',
        amount: 'typical band',
        status: 'ready',
      },
      {
        route: 'universe_build',
        amount: `${opts.moversItemCount + opts.watchlistCount + opts.positionCount} seeds`,
        status: 'ready',
      },
      {
        route: 'compound_rank',
        amount: `${opts.moversItemCount} board`,
        status: opts.moversItemCount > 0 ? 'ready' : 'idle',
      },
      {
        route: 'verify_promote',
        amount: `${opts.watchlistCount} watch`,
        status: 'ready',
      },
      {
        route: 'sector_bulletin',
        amount: `${opts.newsItemCount} items`,
        status: opts.newsItemCount > 0 ? 'ready' : 'idle',
      },
      {
        route: 'daily_phase',
        amount: 'calendar',
        status: 'ready',
      },
      {
        route: 'narrative_compose',
        amount: `${opts.positionCount} held`,
        status: 'ready',
      },
    ];

  const out: MarketHubModelProcessStep[] = [];
  for (const row of shared) {
    const def = ROUTE_DEFS[row.route];
    for (let i = 0; i < def.steps.length; i++) {
      const s = def.steps[i]!;
      out.push({
        id: stepId(`shared:${row.route}`, s.suffix),
        route: row.route,
        label: s.label.slice(0, 120),
        operation: s.operation.slice(0, 80),
        amount: row.amount.slice(0, 40),
        analysisRole: s.analysisRole.slice(0, 40),
        processFunction: s.processFunction,
        sortOrder: i,
        kind: 'shared',
        pipelines: [...def.pipelines],
        feedStages: [...def.feedStages],
        status: row.status,
      });
    }
  }
  // Annotate universe with marks honesty on RS-adjacent shared path.
  void opts.usedLiveMarks;
  void opts.syntheticMarks;
  void opts.admittedConcepts;
  return out;
}

/**
 * Single primary milestone a flow should wire into (D-169).
 * Cuts multi-stage fan-out spaghetti; stage→stage bridges carry the rest.
 */
export function primaryFeedStage(
  flow: MarketHubModelProcessingFlow,
): MarketHubSynthesisStageId | null {
  const stages = flow.targetStages;
  if (stages.length === 0) return null;
  const route = flow.route;
  if (route === 'bars_ohlc') return stages.includes('rs') ? 'rs' : stages[0]!;
  if (route === 'bars_entitle' || route === 'providers_entitle') {
    return stages.includes('providers') ? 'providers' : stages[0]!;
  }
  if (route === 'library_jaccard') {
    return stages.includes('rank') ? 'rank' : stages[0]!;
  }
  if (
    route === 'news_headline' ||
    route === 'web_search' ||
    route === 'filings' ||
    route === 'macro_context' ||
    route === 'fx_context' ||
    route === 'crypto_context'
  ) {
    return stages.includes('gather') ? 'gather' : stages[0]!;
  }
  return stages[0]!;
}

export function routeLabel(route: string): string {
  return route.replace(/_/g, ' ');
}

export { ROUTE_DEFS, KIND_ROUTE };
