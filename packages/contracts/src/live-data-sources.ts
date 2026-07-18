import { z } from 'zod';
import { ResearchSourceKind } from './research-bus';
import {
  ResearchSourceAuthMode,
  ResearchSourceImplementation,
  ResearchSourceLiveMode,
  type ResearchSourceDescriptor,
} from './research-source-registry';

export const LiveDataSourceStatus = z.enum([
  'ready',
  'missing_key',
  'stub',
  'researched',
  'public',
]);
export type LiveDataSourceStatus = z.infer<typeof LiveDataSourceStatus>;

export const LiveDataSourceRow = z.object({
  kind: ResearchSourceKind,
  domain: z.string(),
  label: z.string(),
  authMode: ResearchSourceAuthMode,
  feedClass: z.string(),
  implementation: ResearchSourceImplementation,
  liveMode: ResearchSourceLiveMode,
  status: LiveDataSourceStatus,
  docsUrl: z.string().url(),
  notes: z.string(),
  /** Canvas live_api module ids already bound to this hydrator */
  canvasModuleIds: z.array(z.string().uuid()).default([]),
});
export type LiveDataSourceRow = z.infer<typeof LiveDataSourceRow>;

export const LiveDataSourcesResponse = z.object({
  sources: z.array(LiveDataSourceRow).max(64),
  fetchedAt: z.string().datetime(),
});
export type LiveDataSourcesResponse = z.infer<typeof LiveDataSourcesResponse>;

/** Operator browse/search against one hydrator (lazy; not cached as inventory). */
export const LiveDataSourceQueryMode = z.enum(['search', 'browse']);
export type LiveDataSourceQueryMode = z.infer<typeof LiveDataSourceQueryMode>;

export const LiveDataSourceQueryRequest = z.object({
  query: z.string().max(200).default(''),
  mode: LiveDataSourceQueryMode.default('search'),
  /** Cap evidence widgets returned (operator browse). */
  maxResults: z.number().int().min(1).max(24).default(12),
});
export type LiveDataSourceQueryRequest = z.infer<typeof LiveDataSourceQueryRequest>;

/** Presentation kind for operator Data Explorer cards (not LLM payloads). */
export const LiveDataSourceWidgetKind = z.enum([
  'headline',
  'filing',
  'listing',
  'series',
  'entitlement',
  'generic',
]);
export type LiveDataSourceWidgetKind = z.infer<typeof LiveDataSourceWidgetKind>;

export const LiveDataSourceWidgetField = z.object({
  label: z.string().min(1).max(40),
  value: z.string().min(1).max(500),
});
export type LiveDataSourceWidgetField = z.infer<typeof LiveDataSourceWidgetField>;

export const LiveDataSourceWidget = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(4000),
  feedClass: z.string().min(1).max(80),
  authorityClass: z.string().min(1).max(40),
  externalRef: z.string().max(500).nullable(),
  expiresAt: z.string().datetime().nullable(),
  widgetKind: LiveDataSourceWidgetKind.default('generic'),
  fields: z.array(LiveDataSourceWidgetField).max(12).default([]),
});
export type LiveDataSourceWidget = z.infer<typeof LiveDataSourceWidget>;

export const LiveDataSourceQueryPreset = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  query: z.string().max(200),
  mode: LiveDataSourceQueryMode,
});
export type LiveDataSourceQueryPreset = z.infer<typeof LiveDataSourceQueryPreset>;

export const LiveDataSourceFormHint = z.object({
  placeholder: z.string().max(120),
  helper: z.string().max(200),
  fieldLabel: z.string().max(40),
});
export type LiveDataSourceFormHint = z.infer<typeof LiveDataSourceFormHint>;

export const LiveDataSourceQueryResponse = z.object({
  kind: ResearchSourceKind,
  mode: LiveDataSourceQueryMode,
  query: z.string().max(200),
  status: LiveDataSourceStatus,
  domain: z.string().max(40).optional(),
  widgets: z.array(LiveDataSourceWidget).max(24),
  presets: z.array(LiveDataSourceQueryPreset).max(12).default([]),
  form: LiveDataSourceFormHint.optional(),
  errors: z
    .array(
      z.object({
        code: z.string().max(80),
      }),
    )
    .max(8)
    .default([]),
  fetchedAt: z.string().datetime(),
});
export type LiveDataSourceQueryResponse = z.infer<typeof LiveDataSourceQueryResponse>;

/** Default browse query when operator opens a hydrator without typing. */
export function defaultBrowseQueryForDomain(domain: string): string {
  switch (domain) {
    case 'web_search':
      return 'equity market overview';
    case 'filings':
      return '10-K';
    case 'news':
    case 'equity_news':
      return 'markets';
    case 'equity_bars':
      return 'SPY';
    case 'fx':
      return 'USD';
    case 'crypto':
      return 'bitcoin';
    case 'macro':
      return 'GDP';
    default:
      return 'markets';
  }
}

/** Operator form chrome for Data Explorer live provider views. */
export function liveDataSourceFormForDomain(domain: string): LiveDataSourceFormHint {
  switch (domain) {
    case 'web_search':
      return {
        fieldLabel: 'Search',
        placeholder: 'Topic or company…',
        helper: 'Live web evidence from this search provider.',
      };
    case 'filings':
      return {
        fieldLabel: 'Filing / issuer',
        placeholder: '10-K, 8-K, ticker, or company…',
        helper: 'Public EDGAR full-text results for the query.',
      };
    case 'news':
    case 'equity_news':
      return {
        fieldLabel: 'News query',
        placeholder: 'Symbol, sector, or headline…',
        helper: 'Current headlines available from this feed.',
      };
    case 'equity_bars':
      return {
        fieldLabel: 'Symbol',
        placeholder: 'SPY, AAPL…',
        helper: 'Live OHLC sample for operators (not sent to LLM gather).',
      };
    case 'fx':
      return {
        fieldLabel: 'Base currency',
        placeholder: 'USD, EUR…',
        helper: 'Live ECB reference rates for the base currency.',
      };
    case 'crypto':
      return {
        fieldLabel: 'Asset filter',
        placeholder: 'bitcoin, ethereum…',
        helper: 'Live market-cap ranked listings with price fields.',
      };
    case 'macro':
      return {
        fieldLabel: 'Series / topic',
        placeholder: 'GDP, UNRATE, CPI…',
        helper: 'Macro series metadata from this provider.',
      };
    default:
      return {
        fieldLabel: 'Query',
        placeholder: 'Search this service…',
        helper: 'Live sample from the selected hydrator.',
      };
  }
}

/** One-click browse presets for operator live views. */
export function liveDataSourcePresetsForDomain(domain: string): LiveDataSourceQueryPreset[] {
  switch (domain) {
    case 'web_search':
      return [
        { id: 'overview', label: 'Market overview', query: 'equity market overview', mode: 'browse' },
        { id: 'rates', label: 'Rates', query: 'interest rates federal reserve', mode: 'search' },
        { id: 'earnings', label: 'Earnings', query: 'corporate earnings guidance', mode: 'search' },
      ];
    case 'filings':
      return [
        { id: '10k', label: '10-K', query: '10-K', mode: 'browse' },
        { id: '10q', label: '10-Q', query: '10-Q', mode: 'search' },
        { id: '8k', label: '8-K', query: '8-K', mode: 'search' },
      ];
    case 'news':
    case 'equity_news':
      return [
        { id: 'markets', label: 'Markets', query: 'markets', mode: 'browse' },
        { id: 'tech', label: 'Tech', query: 'technology stocks', mode: 'search' },
        { id: 'macro', label: 'Macro', query: 'inflation employment', mode: 'search' },
      ];
    case 'equity_bars':
      return [
        { id: 'spy', label: 'SPY', query: 'SPY', mode: 'browse' },
        { id: 'qqq', label: 'QQQ', query: 'QQQ', mode: 'search' },
        { id: 'iwm', label: 'IWM', query: 'IWM', mode: 'search' },
      ];
    case 'fx':
      return [
        { id: 'usd', label: 'USD base', query: 'USD', mode: 'browse' },
        { id: 'eur', label: 'EUR base', query: 'EUR', mode: 'search' },
      ];
    case 'crypto':
      return [
        { id: 'top', label: 'Top markets', query: 'bitcoin', mode: 'browse' },
        { id: 'eth', label: 'Ethereum', query: 'ethereum', mode: 'search' },
      ];
    case 'macro':
      return [
        { id: 'gdp', label: 'GDP', query: 'GDP', mode: 'browse' },
        { id: 'unrate', label: 'Unemployment', query: 'UNRATE', mode: 'search' },
        { id: 'cpi', label: 'CPI', query: 'CPIAUCSL', mode: 'search' },
      ];
    default:
      return [
        {
          id: 'default',
          label: 'Browse current',
          query: defaultBrowseQueryForDomain(domain),
          mode: 'browse',
        },
      ];
  }
}

export function widgetKindForDomain(domain: string): LiveDataSourceWidgetKind {
  switch (domain) {
    case 'web_search':
    case 'news':
    case 'equity_news':
      return 'headline';
    case 'filings':
      return 'filing';
    case 'crypto':
    case 'fx':
      return 'listing';
    case 'macro':
      return 'series';
    case 'equity_bars':
      return 'entitlement';
    default:
      return 'generic';
  }
}

/** Map a research evidence package into an operator Data Explorer widget card. */
export function evidenceToLiveDataSourceWidget(
  pkg: {
    digest: string;
    title: string;
    summary: string;
    feedClass: string;
    authorityClass: string;
    externalRef: string | null;
    expiresAt: string | null;
  },
  opts: { domain: string; index: number; query: string },
): LiveDataSourceWidget {
  const widgetKind = widgetKindForDomain(opts.domain);
  const fields: LiveDataSourceWidgetField[] = [
    { label: 'Feed', value: pkg.feedClass.replace(/_/g, ' ') },
    { label: 'Authority', value: pkg.authorityClass.replace(/_/g, ' ') },
  ];
  if (opts.query.trim()) {
    fields.push({ label: 'Query', value: opts.query.trim().slice(0, 80) });
  }
  if (pkg.expiresAt) {
    fields.push({ label: 'Expires', value: pkg.expiresAt.slice(0, 19).replace('T', ' ') + 'Z' });
  }

  return LiveDataSourceWidget.parse({
    id: pkg.digest.slice(0, 16) || `w-${opts.index}`,
    title: pkg.title,
    summary: pkg.summary,
    feedClass: pkg.feedClass,
    authorityClass: pkg.authorityClass,
    externalRef: pkg.externalRef,
    expiresAt: pkg.expiresAt,
    widgetKind,
    fields,
  });
}

export function liveDataSourceLabel(kind: z.infer<typeof ResearchSourceKind>): string {
  return kind.replace(/_/g, ' ');
}

/** DATA tab: only usable sources (credential-ready or public no-auth). */
export function isActiveLiveDataSource(
  row: Pick<LiveDataSourceRow, 'status'>,
): boolean {
  return row.status === 'ready' || row.status === 'public';
}

/**
 * Map registry descriptor + credential readiness to operator-facing status.
 * researched/stub override auth; public = no-auth sources that are ready.
 */
export function resolveLiveDataSourceStatus(
  descriptor: Pick<ResearchSourceDescriptor, 'implementation' | 'authMode'>,
  ready: boolean,
): LiveDataSourceStatus {
  switch (descriptor.implementation) {
    case 'researched':
      return 'researched';
    case 'stub':
      return 'stub';
    case 'shipped': {
      if (descriptor.authMode === 'none' && ready) return 'public';
      if (ready) return 'ready';
      return 'missing_key';
    }
    default: {
      const _exhaustive: never = descriptor.implementation;
      return _exhaustive;
    }
  }
}
