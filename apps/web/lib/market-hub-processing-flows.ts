/**
 * Per-API processing flow catalog for Market Posture Model (D-156).
 * Mirrors engine lanes: each service has distinct adapters and analysis roles —
 * not a single dump into gather.
 */

import type {
  MarketHubModelLiveSource,
  MarketHubModelProcessingFlow,
  MarketHubSynthesisStageId,
} from '@hftr/contracts';

type FlowTemplate = {
  idSuffix: string;
  adapterLabel: string;
  analysisRoles: string[];
  operation: string;
  targetStages: MarketHubSynthesisStageId[];
  pipelines: Array<'movers' | 'sector'>;
};

/** Static adapter → stage wiring matching movers + sector handlers. */
const FLOW_TEMPLATES: Record<string, FlowTemplate[]> = {
  gdelt_news: [
    {
      idSuffix: 'headline',
      adapterLabel: 'GDELT DOC gather',
      analysisRoles: ['news_corpus', 'universe_tickers', 'corroboration'],
      operation: 'headline gather',
      targetStages: ['gather', 'thresholds', 'universe', 'rank', 'verify', 'seal_movers', 'sector'],
      pipelines: ['movers', 'sector'],
    },
  ],
  market_news: [
    {
      idSuffix: 'headline',
      adapterLabel: 'Market news gather',
      analysisRoles: ['news_corpus', 'universe_tickers', 'corroboration'],
      operation: 'headline gather',
      targetStages: ['gather', 'thresholds', 'universe', 'rank', 'verify', 'seal_movers', 'sector'],
      pipelines: ['movers', 'sector'],
    },
  ],
  alpha_vantage_news: [
    {
      idSuffix: 'headline',
      adapterLabel: 'Alpha Vantage news gather',
      analysisRoles: ['news_corpus', 'universe_tickers', 'corroboration'],
      operation: 'headline gather',
      targetStages: ['gather', 'thresholds', 'universe', 'rank', 'verify', 'seal_movers', 'sector'],
      pipelines: ['movers', 'sector'],
    },
  ],
  alpaca_news: [
    {
      idSuffix: 'headline',
      adapterLabel: 'Alpaca news gather',
      analysisRoles: ['news_corpus', 'universe_tickers', 'corroboration'],
      operation: 'headline gather',
      targetStages: ['gather', 'thresholds', 'universe', 'rank', 'verify', 'seal_movers', 'sector'],
      pipelines: ['movers', 'sector'],
    },
  ],
  finnhub_news: [
    {
      idSuffix: 'headline',
      adapterLabel: 'Finnhub news gather',
      analysisRoles: ['news_corpus', 'universe_tickers', 'corroboration'],
      operation: 'headline gather',
      targetStages: ['gather', 'thresholds', 'universe', 'rank', 'verify', 'seal_movers', 'sector'],
      pipelines: ['movers', 'sector'],
    },
  ],
  polygon_news: [
    {
      idSuffix: 'headline',
      adapterLabel: 'Polygon news gather',
      analysisRoles: ['news_corpus', 'universe_tickers', 'corroboration'],
      operation: 'headline gather',
      targetStages: ['gather', 'thresholds', 'universe', 'rank', 'verify', 'seal_movers', 'sector'],
      pipelines: ['movers', 'sector'],
    },
  ],
  brave_search: [
    {
      idSuffix: 'web',
      adapterLabel: 'Brave web gather',
      analysisRoles: ['web_corpus', 'corroboration'],
      operation: 'web gather',
      targetStages: ['gather', 'thresholds', 'rank', 'verify', 'seal_movers', 'sector'],
      pipelines: ['movers', 'sector'],
    },
  ],
  sec_edgar: [
    {
      idSuffix: 'filings',
      adapterLabel: 'SEC EDGAR filings gather',
      analysisRoles: ['filings_corpus', 'corroboration'],
      operation: 'filings gather',
      targetStages: ['gather', 'thresholds', 'rank', 'verify', 'seal_movers'],
      pipelines: ['movers'],
    },
  ],
  fred_macro: [
    {
      idSuffix: 'macro',
      adapterLabel: 'FRED macro context',
      analysisRoles: ['macro_context', 'corroboration'],
      operation: 'macro gather',
      targetStages: ['gather', 'thresholds', 'rank', 'verify', 'seal_movers'],
      pipelines: ['movers'],
    },
  ],
  world_bank_indicator: [
    {
      idSuffix: 'macro',
      adapterLabel: 'World Bank indicators',
      analysisRoles: ['macro_context', 'corroboration'],
      operation: 'macro gather',
      targetStages: ['gather', 'thresholds', 'rank', 'verify', 'seal_movers'],
      pipelines: ['movers'],
    },
  ],
  frankfurter_fx: [
    {
      idSuffix: 'fx',
      adapterLabel: 'Frankfurter FX context',
      analysisRoles: ['macro_context', 'corroboration'],
      operation: 'fx context',
      targetStages: ['gather', 'thresholds', 'rank', 'verify', 'seal_movers'],
      pipelines: ['movers'],
    },
  ],
  coingecko_crypto: [
    {
      idSuffix: 'crypto',
      adapterLabel: 'CoinGecko crypto context',
      analysisRoles: ['macro_context', 'corroboration'],
      operation: 'crypto context',
      targetStages: ['gather', 'thresholds', 'rank', 'verify', 'seal_movers'],
      pipelines: ['movers'],
    },
  ],
  alpaca_bars: [
    {
      idSuffix: 'entitle',
      adapterLabel: 'Alpaca bars entitlement',
      analysisRoles: ['bars_entitlement', 'corroboration'],
      operation: 'entitle check',
      targetStages: ['gather', 'thresholds', 'verify', 'seal_movers'],
      pipelines: ['movers'],
    },
    {
      idSuffix: 'ohlc',
      adapterLabel: 'Alpaca OHLC fetch',
      analysisRoles: ['relative_strength', 'volume_expansion'],
      operation: 'bars → RS',
      targetStages: ['rs', 'rank'],
      pipelines: ['movers'],
    },
  ],
  twelve_data: [
    {
      idSuffix: 'entitle',
      adapterLabel: 'Twelve Data entitlement',
      analysisRoles: ['bars_entitlement', 'corroboration'],
      operation: 'entitle check',
      targetStages: ['gather', 'thresholds', 'rank', 'verify', 'seal_movers'],
      pipelines: ['movers'],
    },
  ],
  marketstack: [
    {
      idSuffix: 'entitle',
      adapterLabel: 'Marketstack EOD entitlement',
      analysisRoles: ['bars_entitlement', 'corroboration'],
      operation: 'entitle check',
      targetStages: ['gather', 'thresholds', 'rank', 'verify', 'seal_movers'],
      pipelines: ['movers'],
    },
  ],
};

function amountForFlow(opts: {
  contributed: boolean;
  status: MarketHubModelLiveSource['status'];
  canvasBoundCount: number;
  flow: FlowTemplate;
}): string {
  if (opts.status === 'missing_key') return 'need key';
  if (opts.status === 'stub' || opts.status === 'researched') return opts.status;
  if (opts.contributed) return 'sealed contrib';
  if (opts.flow.idSuffix === 'ohlc') {
    return opts.status === 'ready' || opts.status === 'public' ? 'RS path' : 'idle';
  }
  if (opts.canvasBoundCount > 0) return `${opts.canvasBoundCount} canvas`;
  if (opts.status === 'ready' || opts.status === 'public') return 'ready';
  return 'idle';
}

/**
 * Build processingFlows for live sources — one or more adapter paths per kind.
 */
export function buildLiveProcessingFlows(
  liveSources: MarketHubModelLiveSource[],
): MarketHubModelProcessingFlow[] {
  const out: MarketHubModelProcessingFlow[] = [];
  for (const src of liveSources) {
    const templates = FLOW_TEMPLATES[src.kind];
    if (!templates) continue;
    for (const flow of templates) {
      out.push({
        id: `${src.kind}:${flow.idSuffix}`.slice(0, 80),
        kind: src.kind,
        adapterLabel: flow.adapterLabel.slice(0, 120),
        analysisRoles: flow.analysisRoles.slice(0, 8),
        operation: flow.operation.slice(0, 80),
        amount: amountForFlow({
          contributed: src.contributed,
          status: src.status,
          canvasBoundCount: src.canvasBoundCount,
          flow,
        }).slice(0, 40),
        targetStages: flow.targetStages,
        pipelines: flow.pipelines,
        status: src.status,
        contributed: src.contributed,
      });
    }
  }
  return out.slice(0, 64);
}

/**
 * Library corpus flows — Jaccard into thresholds/rank/seal (movers).
 */
export function buildLibraryProcessingFlows(opts: {
  libraryId: string;
  name: string;
  admittedCount: number;
  shelf: string;
}): MarketHubModelProcessingFlow[] {
  const amount =
    opts.admittedCount > 0 ? `${opts.admittedCount} lenses` : 'empty corpus';
  return [
    {
      id: `library:${opts.libraryId}:jaccard`.slice(0, 80),
      kind: `library:${opts.libraryId}`.slice(0, 80),
      adapterLabel: `Corpus Jaccard · ${opts.name}`.slice(0, 120),
      analysisRoles: ['library_jaccard', 'corroboration'],
      operation: opts.shelf === 'system' ? 'system corpus' : 'library feed',
      amount: amount.slice(0, 40),
      targetStages: ['thresholds', 'rank', 'seal_movers'],
      pipelines: ['movers'],
      status: opts.admittedCount > 0 ? 'ready' : 'idle',
      contributed: opts.admittedCount > 0,
    },
  ];
}
