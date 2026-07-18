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
  maxResults: z.number().int().min(1).max(12).default(8),
});
export type LiveDataSourceQueryRequest = z.infer<typeof LiveDataSourceQueryRequest>;

export const LiveDataSourceWidget = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(4000),
  feedClass: z.string().min(1).max(80),
  authorityClass: z.string().min(1).max(40),
  externalRef: z.string().max(500).nullable(),
  expiresAt: z.string().datetime().nullable(),
});
export type LiveDataSourceWidget = z.infer<typeof LiveDataSourceWidget>;

export const LiveDataSourceQueryResponse = z.object({
  kind: ResearchSourceKind,
  mode: LiveDataSourceQueryMode,
  query: z.string().max(200),
  status: LiveDataSourceStatus,
  widgets: z.array(LiveDataSourceWidget).max(12),
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

export function liveDataSourceLabel(kind: z.infer<typeof ResearchSourceKind>): string {
  return kind.replace(/_/g, ' ');
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
