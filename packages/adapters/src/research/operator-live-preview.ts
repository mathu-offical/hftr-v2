/**
 * Operator-only live previews for Data Explorer.
 * May include numeric display strings for UI — never feed these into LLM prompts,
 * EvidencePackage gather, or jobs.payload (D-008 / D-074).
 */

import {
  LiveDataSourceWidget,
  RESEARCH_SOURCE_FEED_CLASS,
  type LiveDataSourceWidget as LiveDataSourceWidgetT,
  type ResearchSourceKind as ResearchSourceKindT,
} from '@hftr/contracts';
import { createAlpacaClient } from '../alpaca/client';
import { fetchBars } from '../alpaca/bars';
import { extractTickerFromQuery } from './alpaca-bars-evidence';

export type OperatorLivePreviewCredentials = {
  alpacaKeyId?: string;
  alpacaSecret?: string;
};

function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

async function previewCoingecko(limit: number): Promise<LiveDataSourceWidgetT[]> {
  const url =
    'https://api.coingecko.com/api/v3/coins/markets' +
    `?vs_currency=usd&order=market_cap_desc&per_page=${Math.min(limit, 24)}&page=1`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'hftr-v2-operator-preview/1.0',
    },
  });
  if (!res.ok) throw new Error(`coingecko_http_${res.status}`);
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new Error('coingecko_parse');

  return body.slice(0, limit).map((row, i) => {
    const r = row as {
      id?: string;
      symbol?: string;
      name?: string;
      current_price?: number;
      market_cap_rank?: number;
      price_change_percentage_24h?: number;
    };
    const symbol = (r.symbol ?? 'crypto').toUpperCase();
    const name = r.name?.trim() || symbol;
    const price = typeof r.current_price === 'number' ? r.current_price : null;
    const change =
      typeof r.price_change_percentage_24h === 'number' ? r.price_change_percentage_24h : null;
    const rank = typeof r.market_cap_rank === 'number' ? r.market_cap_rank : null;

    return LiveDataSourceWidget.parse({
      id: `cg-${r.id ?? i}`,
      title: name !== symbol ? `${name} (${symbol})` : symbol,
      summary: 'Live CoinGecko market listing (operator preview).',
      feedClass: RESEARCH_SOURCE_FEED_CLASS.coingecko_crypto,
      authorityClass: 'DETERMINISTIC',
      externalRef: r.id ? `https://www.coingecko.com/en/coins/${r.id}` : null,
      expiresAt: null,
      widgetKind: 'listing',
      fields: [
        ...(rank !== null ? [{ label: 'Rank', value: String(rank) }] : []),
        ...(price !== null ? [{ label: 'Price USD', value: fmtNum(price, 6) }] : []),
        ...(change !== null
          ? [{ label: '24h %', value: `${change >= 0 ? '+' : ''}${fmtNum(change, 2)}` }]
          : []),
        { label: 'Source', value: 'CoinGecko' },
      ],
    });
  });
}

async function previewFrankfurter(baseQuery: string, limit: number): Promise<LiveDataSourceWidgetT[]> {
  const base = (baseQuery.trim().toUpperCase().match(/^[A-Z]{3}/)?.[0] ?? 'USD').slice(0, 3);
  const url = `https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(base)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`frankfurter_http_${res.status}`);
  const raw = (await res.json()) as unknown;

  const pairs: Array<{ quote: string; rate: number }> = [];
  if (Array.isArray(raw)) {
    for (const row of raw as Array<{ quote?: string; rate?: number }>) {
      if (row.quote && typeof row.rate === 'number') {
        pairs.push({ quote: row.quote, rate: row.rate });
      }
    }
  } else if (raw && typeof raw === 'object' && 'rates' in raw) {
    const rates = (raw as { rates?: Record<string, number> }).rates ?? {};
    for (const [quote, rate] of Object.entries(rates)) {
      if (typeof rate === 'number') pairs.push({ quote, rate });
    }
  }

  return pairs.slice(0, limit).map((p, i) =>
    LiveDataSourceWidget.parse({
      id: `fx-${base}-${p.quote}-${i}`,
      title: `${base} / ${p.quote}`,
      summary: 'Live Frankfurter ECB reference rate (operator preview).',
      feedClass: RESEARCH_SOURCE_FEED_CLASS.frankfurter_fx,
      authorityClass: 'DETERMINISTIC',
      externalRef: `https://www.frankfurter.app/${base}`,
      expiresAt: null,
      widgetKind: 'listing',
      fields: [
        { label: 'Base', value: base },
        { label: 'Quote', value: p.quote },
        { label: 'Rate', value: fmtNum(p.rate, 6) },
        { label: 'Source', value: 'Frankfurter' },
      ],
    }),
  );
}

async function previewAlpacaBars(
  query: string,
  credentials: { keyId: string; secret: string },
  limit: number,
): Promise<LiveDataSourceWidgetT[]> {
  const symbol = extractTickerFromQuery(query) ?? 'SPY';
  const client = createAlpacaClient({
    keyId: credentials.keyId,
    secret: credentials.secret,
  });
  const result = await fetchBars({
    symbol,
    limit: Math.min(Math.max(limit, 5), 24),
    credentials,
    client,
  });

  const latest = result.bars[result.bars.length - 1];
  const widgets: LiveDataSourceWidgetT[] = [
    LiveDataSourceWidget.parse({
      id: `alpaca-bars-${symbol}-summary`,
      title: `${symbol} · bar feed`,
      summary: 'Live Alpaca bar sample (operator preview; OHLC for display only).',
      feedClass: result.feedClass || RESEARCH_SOURCE_FEED_CLASS.alpaca_bars,
      authorityClass: 'DETERMINISTIC',
      externalRef: result.requestId ? `alpaca-request:${result.requestId}` : null,
      expiresAt: null,
      widgetKind: 'entitlement',
      fields: [
        { label: 'Symbol', value: symbol },
        { label: 'Bars', value: String(result.bars.length) },
        { label: 'Feed', value: result.feedClass || 'iex' },
        ...(latest
          ? [
              { label: 'Last close', value: fmtNum(latest.close, 4) },
              { label: 'Last high', value: fmtNum(latest.high, 4) },
              { label: 'Last low', value: fmtNum(latest.low, 4) },
              { label: 'Bar time', value: latest.timestamp.slice(0, 19).replace('T', ' ') },
            ]
          : [{ label: 'Series', value: 'empty' }]),
      ],
    }),
  ];

  for (const [i, bar] of result.bars.slice(-Math.min(limit - 1, 8)).entries()) {
    widgets.push(
      LiveDataSourceWidget.parse({
        id: `alpaca-bar-${symbol}-${i}`,
        title: `${symbol} · ${bar.timestamp.slice(0, 16).replace('T', ' ')}`,
        summary: 'OHLC bar (operator preview).',
        feedClass: result.feedClass || RESEARCH_SOURCE_FEED_CLASS.alpaca_bars,
        authorityClass: 'DETERMINISTIC',
        externalRef: null,
        expiresAt: null,
        widgetKind: 'entitlement',
        fields: [
          { label: 'Open', value: fmtNum(bar.open, 4) },
          { label: 'High', value: fmtNum(bar.high, 4) },
          { label: 'Low', value: fmtNum(bar.low, 4) },
          { label: 'Close', value: fmtNum(bar.close, 4) },
          { label: 'Volume', value: fmtNum(bar.volume, 0) },
        ],
      }),
    );
  }

  return widgets.slice(0, limit);
}

/**
 * Build operator live widgets when a richer preview exists for the hydrator.
 * Returns null when this kind should keep evidence-package widgets only.
 */
export async function buildOperatorLivePreviewWidgets(opts: {
  kind: ResearchSourceKindT;
  query: string;
  maxResults: number;
  credentials: OperatorLivePreviewCredentials;
}): Promise<LiveDataSourceWidgetT[] | null> {
  const limit = Math.min(Math.max(1, opts.maxResults), 24);

  switch (opts.kind) {
    case 'coingecko_crypto':
      return previewCoingecko(limit);
    case 'frankfurter_fx':
      return previewFrankfurter(opts.query, limit);
    case 'alpaca_bars': {
      const keyId = opts.credentials.alpacaKeyId?.trim();
      const secret = opts.credentials.alpacaSecret?.trim();
      if (!keyId || !secret) return null;
      return previewAlpacaBars(opts.query, { keyId, secret }, limit);
    }
    default:
      return null;
  }
}
