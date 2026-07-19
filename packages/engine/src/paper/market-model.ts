import type { BrokerAdapter, QuoteSnapshot } from '@hftr/contracts';
import { createAlpacaPaperAdapter } from '@hftr/adapters';
import type { Db } from '@hftr/db';
import type { Clock } from '../clock';
import {
  defaultLoadAlpacaPaperCredentials,
  type AlpacaPaperCredentials,
} from '../calc/refresh-atr-stream';
import { loadQuoteCandidatesFromValueRefs } from '../calc/load-quote-value-refs';
import { getSyntheticQuote } from '../dispatch/quotes';

/**
 * MarketModel quote resolution (D-122 / D-171 / D-172).
 * Prefer entitled live quotes; fuse ValueRef marks + adapter + owner teacher; honest feedClass.
 * Does not submit orders — quotes / marks only.
 */

export { MARKET_MODEL_QUOTE_TTL_MS } from '../calc/load-quote-value-refs';
import { MARKET_MODEL_QUOTE_TTL_MS } from '../calc/load-quote-value-refs';

export interface ResolveMarketQuoteOpts {
  symbol: string;
  clock: Clock;
  /** Live/adapter quote when entitled; null → synthetic. */
  liveQuote?: QuoteSnapshot | null;
  /** Additional candidates (e.g. ValueRef-derived marks) — fused with liveQuote. */
  candidates?: readonly QuoteSnapshot[];
}

export interface ResolvedMarketQuote {
  quote: QuoteSnapshot;
  sourceClass: 'broker_state' | 'live_feed' | 'synthetic_sim';
  usedLive: boolean;
}

function hasPrice(q: QuoteSnapshot): boolean {
  return q.lastCents != null || q.askCents != null || q.bidCents != null;
}

function sourceClassForFeed(feed: string): ResolvedMarketQuote['sourceClass'] {
  if (feed.includes('synthetic') || feed === 'synthetic_sim') return 'synthetic_sim';
  if (feed.includes('paper') || feed.includes('alpaca') || feed.includes('iex')) {
    return 'broker_state';
  }
  return 'live_feed';
}

function quoteAsOfMs(q: QuoteSnapshot): number {
  const t = Date.parse(q.asOfIso);
  return Number.isFinite(t) ? t : 0;
}

function isLivePriced(q: QuoteSnapshot): boolean {
  return hasPrice(q) && sourceClassForFeed(q.feedClass ?? 'live_feed') !== 'synthetic_sim';
}

function isFreshQuote(q: QuoteSnapshot, nowMs: number, ttlMs = MARKET_MODEL_QUOTE_TTL_MS): boolean {
  const asOf = quoteAsOfMs(q);
  return Number.isFinite(asOf) && nowMs - asOf <= ttlMs;
}

/** Prefer newest non-synthetic quote with a price; else best synthetic; else null. */
export function fuseQuoteCandidates(
  candidates: readonly QuoteSnapshot[],
): QuoteSnapshot | null {
  const priced = candidates.filter(hasPrice);
  if (priced.length === 0) return null;
  const live = priced
    .filter((q) => sourceClassForFeed(q.feedClass ?? 'live_feed') !== 'synthetic_sim')
    .sort((a, b) => quoteAsOfMs(b) - quoteAsOfMs(a));
  if (live[0]) return live[0]!;
  return [...priced].sort((a, b) => quoteAsOfMs(b) - quoteAsOfMs(a))[0] ?? null;
}

export function resolveMarketQuote(opts: ResolveMarketQuoteOpts): ResolvedMarketQuote {
  const pooled: QuoteSnapshot[] = [];
  if (opts.liveQuote) pooled.push(opts.liveQuote);
  if (opts.candidates) pooled.push(...opts.candidates);
  const fused = fuseQuoteCandidates(pooled);

  if (fused) {
    const feed = fused.feedClass ?? 'live_feed';
    const sourceClass = sourceClassForFeed(feed);
    return {
      quote: {
        ...fused,
        symbol: fused.symbol.toUpperCase(),
        feedClass: feed,
      },
      sourceClass,
      usedLive: sourceClass !== 'synthetic_sim',
    };
  }
  return {
    quote: getSyntheticQuote(opts.symbol, opts.clock),
    sourceClass: 'synthetic_sim',
    usedLive: false,
  };
}

/** Best-effort adapter quote for MarketModel (never throws). */
export async function loadAdapterMarketQuote(
  adapter: BrokerAdapter | null | undefined,
  symbol: string,
): Promise<QuoteSnapshot | null> {
  if (!adapter || adapter.venue === 'paper_sim') return null;
  try {
    return await adapter.getQuote(symbol);
  } catch {
    return null;
  }
}

export type LoadOwnerAlpacaPaperQuote = (
  db: Db,
  companyId: string,
  symbol: string,
) => Promise<QuoteSnapshot | null>;

/**
 * Quote-only Alpaca paper teacher for unbound `paper_sim` companies (D-171 / D-137).
 * Uses company bind → module bindings → owner connected paper creds.
 * Never calls submitOrder — MarketModel teacher only; fail-open to null.
 */
export async function loadOwnerAlpacaPaperQuote(
  db: Db,
  companyId: string,
  symbol: string,
  deps?: {
    loadCredentials?: (
      db: Db,
      companyId: string,
    ) => Promise<AlpacaPaperCredentials | null>;
    createQuoteAdapter?: (creds: AlpacaPaperCredentials) => BrokerAdapter;
    /** Injectable clock read for adapter `asOfIso` (D-009). */
    nowMs?: () => number;
  },
): Promise<QuoteSnapshot | null> {
  try {
    const load = deps?.loadCredentials ?? defaultLoadAlpacaPaperCredentials;
    const creds = await load(db, companyId);
    if (!creds) return null;
    const nowMs = deps?.nowMs ?? (() => Date.now());
    const create =
      deps?.createQuoteAdapter ??
      ((c: AlpacaPaperCredentials) =>
        createAlpacaPaperAdapter({ keyId: c.keyId, secret: c.secret, nowMs }));
    const adapter = create(creds);
    return await adapter.getQuote(symbol);
  } catch {
    return null;
  }
}

/**
 * Resolve a mark/quote for dispatch, exits, or equity using optional live adapter.
 */
export async function resolveMarketQuoteWithAdapter(opts: {
  symbol: string;
  clock: Clock;
  adapter?: BrokerAdapter | null;
  candidates?: readonly QuoteSnapshot[];
}): Promise<ResolvedMarketQuote> {
  const liveQuote = await loadAdapterMarketQuote(opts.adapter, opts.symbol);
  return resolveMarketQuote({
    symbol: opts.symbol,
    clock: opts.clock,
    liveQuote,
    ...(opts.candidates !== undefined ? { candidates: opts.candidates } : {}),
  });
}

/**
 * Dispatch/compile MarketModel resolution (D-171 / D-172):
 * 1) Bound non-`paper_sim` adapter quote
 * 2) Fresh company ValueRef marks (live_api / prior quotes)
 * 3) Owner/module Alpaca paper quote teacher (read-only)
 * 4) Synthetic fail-open
 *
 * Keeps `funds_only` + `paper_sim` venue for fills while pricing from live market data
 * when entitled credentials / marks exist — no submitOrder on the teacher path.
 */
export async function resolveDispatchMarketQuote(opts: {
  db: Db;
  clock: Clock;
  companyId: string;
  symbol: string;
  adapter?: BrokerAdapter | null;
  candidates?: readonly QuoteSnapshot[];
  loadOwnerQuote?: LoadOwnerAlpacaPaperQuote;
  /** Override freshness TTL (tests). Default 90s — matches dispatch QUOTE_TTL_MS. */
  quoteTtlMs?: number;
  /** Skip ValueRef load (tests). */
  skipValueRefs?: boolean;
}): Promise<ResolvedMarketQuote> {
  const nowMs = opts.clock.nowMs();
  const ttlMs = opts.quoteTtlMs ?? MARKET_MODEL_QUOTE_TTL_MS;
  const pooled: QuoteSnapshot[] = [...(opts.candidates ?? [])];
  const fromAdapter = await loadAdapterMarketQuote(opts.adapter, opts.symbol);
  if (fromAdapter) pooled.push(fromAdapter);

  if (!opts.skipValueRefs) {
    const fromRefs = await loadQuoteCandidatesFromValueRefs(opts.db, opts.clock, {
      companyId: opts.companyId,
      symbol: opts.symbol,
      ttlMs,
    });
    pooled.push(...fromRefs);
  }

  if (!pooled.some((q) => isLivePriced(q) && isFreshQuote(q, nowMs, ttlMs))) {
    const loadOwner =
      opts.loadOwnerQuote ??
      ((db, companyId, symbol) =>
        loadOwnerAlpacaPaperQuote(db, companyId, symbol, {
          nowMs: () => opts.clock.nowMs(),
        }));
    try {
      const ownerQuote = await loadOwner(opts.db, opts.companyId, opts.symbol);
      if (ownerQuote) pooled.push(ownerQuote);
    } catch {
      // Fail-open: teacher unavailable → synthetic below.
    }
  }

  // Prefer fresh live; drop stale live so we do not trip quote_freshness fail-closed
  // with a teacher that is already past the dispatch TTL (D-171).
  const usable = pooled.filter(
    (q) => !isLivePriced(q) || isFreshQuote(q, nowMs, ttlMs),
  );

  return resolveMarketQuote({
    symbol: opts.symbol,
    clock: opts.clock,
    candidates: usable,
  });
}
