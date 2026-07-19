import type { BrokerAdapter, QuoteSnapshot, SessionPhase } from '@hftr/contracts';
import { createAlpacaPaperAdapter } from '@hftr/adapters';
import type { Db } from '@hftr/db';
import type { Clock } from '../clock';
import {
  defaultLoadAlpacaPaperCredentials,
  type AlpacaPaperCredentials,
} from '../calc/refresh-atr-stream';
import { loadQuoteCandidatesFromValueRefs } from '../calc/load-quote-value-refs';
import { getSession, sessionPhase, venueDate } from '../calendar/calendar';
import { getSyntheticQuote } from '../dispatch/quotes';
import { recordPolledQuotesAsValueRefs } from '../live-api/record-poll-quotes';

/**
 * MarketModel quote resolution (D-122 / D-171 / D-177).
 * Prefer entitled live quotes; fuse ValueRef marks + adapter + owner teacher; honest feedClass.
 * Does not submit orders — quotes / marks only.
 */

export { MARKET_MODEL_QUOTE_TTL_MS } from '../calc/load-quote-value-refs';
import { MARKET_MODEL_QUOTE_TTL_MS } from '../calc/load-quote-value-refs';

/** Reject off-hours prior-session marks older than this (weekend/holiday paper). */
const MAX_PRIOR_SESSION_MARK_AGE_MS = 5 * 24 * 60 * 60 * 1000;

const NY_TZ = 'America/New_York';

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
  /**
   * True when a venue/ValueRef mark was rebucketed to now because the session is
   * off-hours (D-177). Price provenance remains live; asOf refreshed for gauntlet.
   */
  priorSessionMark?: boolean;
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

function isOffHoursPhase(phase: SessionPhase): boolean {
  switch (phase) {
    case 'closed':
    case 'pre_market':
    case 'overnight':
      return true;
    case 'open':
    case 'midday':
    case 'power_hour':
      return false;
    default: {
      const _exhaustive: never = phase;
      void _exhaustive;
      return true;
    }
  }
}

/**
 * Off-hours: accept a stale venue/ValueRef mark by stamping asOf=now for the
 * paper gauntlet while keeping venue prices (honest prior-session mark).
 */
export function rebucketOffHoursMark(
  q: QuoteSnapshot,
  opts: { nowMs: number; nowIso: string; ttlMs?: number; phase: SessionPhase },
): { quote: QuoteSnapshot; priorSessionMark: boolean } | null {
  if (!isLivePriced(q)) return null;
  const ttlMs = opts.ttlMs ?? MARKET_MODEL_QUOTE_TTL_MS;
  if (isFreshQuote(q, opts.nowMs, ttlMs)) {
    return { quote: q, priorSessionMark: false };
  }
  if (!isOffHoursPhase(opts.phase)) return null;
  const age = opts.nowMs - quoteAsOfMs(q);
  if (!Number.isFinite(age) || age > MAX_PRIOR_SESSION_MARK_AGE_MS || age < 0) return null;
  return {
    quote: { ...q, asOfIso: opts.nowIso },
    priorSessionMark: true,
  };
}

async function loadSessionPhaseForMarketModel(
  db: Db,
  clock: Clock,
): Promise<SessionPhase> {
  try {
    const nowMs = clock.nowMs();
    const session = await getSession(db, 'XNYS', venueDate(nowMs, NY_TZ));
    return sessionPhase(session, nowMs);
  } catch {
    return 'closed';
  }
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
 * Dispatch/compile MarketModel resolution (D-171 / D-177):
 * 1) Bound non-`paper_sim` adapter quote
 * 2) Fresh company ValueRef marks (live_api / prior quotes)
 * 3) Owner/module Alpaca paper quote teacher (read-only)
 * 4) Off-hours: rebucket stale venue marks to now (prior_session_mark)
 * 5) Synthetic fail-open
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
  /** Inject session phase (tests). */
  sessionPhaseOverride?: SessionPhase;
}): Promise<ResolvedMarketQuote> {
  const nowMs = opts.clock.nowMs();
  const ttlMs = opts.quoteTtlMs ?? MARKET_MODEL_QUOTE_TTL_MS;
  const phase =
    opts.sessionPhaseOverride ?? (await loadSessionPhaseForMarketModel(opts.db, opts.clock));
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

  let priorSessionMark = false;
  const usable: QuoteSnapshot[] = [];
  for (const q of pooled) {
    if (!isLivePriced(q)) {
      usable.push(q);
      continue;
    }
    if (isFreshQuote(q, nowMs, ttlMs)) {
      usable.push(q);
      continue;
    }
    const rebucketed = rebucketOffHoursMark(q, {
      nowMs,
      nowIso: opts.clock.nowIso(),
      ttlMs,
      phase,
    });
    if (rebucketed) {
      usable.push(rebucketed.quote);
      if (rebucketed.priorSessionMark) priorSessionMark = true;
    }
    // Else drop stale live during RTH so we do not trip quote_freshness (D-171).
  }

  const resolved = resolveMarketQuote({
    symbol: opts.symbol,
    clock: opts.clock,
    candidates: usable,
  });
  return {
    ...resolved,
    ...(priorSessionMark && resolved.usedLive ? { priorSessionMark: true } : {}),
  };
}

/**
 * Operator-facing honesty tags for a resolved MarketModel quote before dispatch (D-192).
 * Does not invent fill/drain tags — only quote-class provenance.
 */
export function previewHonestyTagsFromResolvedQuote(
  resolved: ResolvedMarketQuote,
  opts?: { routingMode?: 'funds_only' | 'execute_on_service' | 'both_verify' },
): string[] {
  const tags: string[] = [
    resolved.usedLive ? 'live_market_quote' : 'synthetic_quote',
  ];
  if (resolved.priorSessionMark === true) {
    tags.push('prior_session_mark');
  }
  if (opts?.routingMode === 'funds_only') {
    tags.push('funds_only_routing');
  }
  return tags;
}

/**
 * Best-effort: pull adapter/owner teacher quote for an ad-hoc symbol and persist
 * as `live_api:quote:{SYM}` ValueRefs so MarketModel fusion sees them (D-194).
 * Fail-open — never throws.
 */
export async function hydrateOperatorQuoteValueRefs(opts: {
  db: Db;
  clock: Clock;
  companyId: string;
  moduleId?: string | null;
  symbol: string;
  adapter?: BrokerAdapter | null;
  loadOwnerQuote?: LoadOwnerAlpacaPaperQuote;
}): Promise<{ hydrated: boolean }> {
  const symbol = opts.symbol.trim().toUpperCase();
  try {
    let quote = await loadAdapterMarketQuote(opts.adapter, symbol);
    if (!quote) {
      const loadOwner =
        opts.loadOwnerQuote ??
        ((db, companyId, sym) =>
          loadOwnerAlpacaPaperQuote(db, companyId, sym, {
            nowMs: () => opts.clock.nowMs(),
          }));
      quote = await loadOwner(opts.db, opts.companyId, symbol);
    }
    if (!quote) return { hydrated: false };
    const { recorded } = await recordPolledQuotesAsValueRefs({
      db: opts.db,
      clock: opts.clock,
      companyId: opts.companyId,
      moduleId: opts.moduleId ?? null,
      quotes: [[symbol, quote]],
    });
    return { hydrated: recorded > 0 };
  } catch {
    return { hydrated: false };
  }
}
