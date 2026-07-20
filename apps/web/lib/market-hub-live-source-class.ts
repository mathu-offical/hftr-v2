/**
 * Live API class for Market Posture Model (D-186).
 *
 * Live ingest shows continuous market/news **streams**.
 * On-demand search / queryable APIs (Brave, EDGAR, …) are research/process
 * extensions — not live data streams.
 */

import type { ResearchSourceDomain } from '@hftr/contracts';

export type LiveApiSourceClass = 'stream' | 'query';

/** Domains that are pull-on-query research evidence, not live market streams. */
const QUERY_DOMAINS = new Set<ResearchSourceDomain | string>([
  'web_search',
  'filings',
]);

/** Explicit kinds (overrides / complements domain). */
const QUERY_KINDS = new Set<string>(['brave_search', 'sec_edgar']);

/** Process routes owned by query/search APIs. */
const QUERY_ROUTES = new Set<string>(['web_search', 'filings']);

function kindFromNodeId(nodeId: string | null | undefined): string | null {
  if (!nodeId) return null;
  if (nodeId.startsWith('live:')) return nodeId.slice('live:'.length) || null;
  if (nodeId.startsWith('adapter:')) {
    // adapter:{kind}:{suffix} or adapter:{kind}
    const rest = nodeId.slice('adapter:'.length);
    const kind = rest.split(':')[0];
    return kind || null;
  }
  if (nodeId.startsWith('process:') && !nodeId.startsWith('process:shared:')) {
    // process:{kind}:{step} or process:engine:…
    const parts = nodeId.split(':');
    if (parts[1] === 'library' || parts[1] === 'engine') return null;
    return parts[1] || null;
  }
  if (nodeId.startsWith('cluster:process:')) {
    const route = nodeId.slice('cluster:process:'.length);
    if (QUERY_ROUTES.has(route)) return route === 'web_search' ? 'brave_search' : 'sec_edgar';
    return null;
  }
  if (nodeId.startsWith('analyze:')) {
    const parts = nodeId.split(':');
    return parts[1] || null;
  }
  return null;
}

/**
 * Classify a live API / process node as stream (Live ingest) or query (Process).
 */
export function classifyLiveApiSource(input: {
  kind?: string | null;
  domain?: string | null;
  processRoute?: string | null;
  nodeId?: string | null;
  nodeRole?: string | null;
}): LiveApiSourceClass {
  if (input.nodeRole === 'query_source') return 'query';
  if (input.processRoute && QUERY_ROUTES.has(input.processRoute)) return 'query';

  const kind = (input.kind ?? kindFromNodeId(input.nodeId) ?? '').trim();
  if (kind && QUERY_KINDS.has(kind)) return 'query';
  if (kind && QUERY_ROUTES.has(kind)) return 'query';

  const domain = (input.domain ?? '').trim();
  if (domain && QUERY_DOMAINS.has(domain)) return 'query';

  return 'stream';
}

export function isQueryLiveApiKind(kind: string | null | undefined): boolean {
  return classifyLiveApiSource({ kind: kind ?? null }) === 'query';
}

export function isQueryLiveApiDomain(
  domain: string | null | undefined,
): boolean {
  return classifyLiveApiSource({ domain: domain ?? null }) === 'query';
}

export function isQueryProcessRoute(
  route: string | null | undefined,
): boolean {
  return Boolean(route && QUERY_ROUTES.has(route));
}
