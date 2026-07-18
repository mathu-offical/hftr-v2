import { createAlpacaClient, type AlpacaClient } from './client';

export interface OhlcBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AlpacaBarsCredentials {
  keyId: string;
  secret: string;
}

export interface FetchBarsParams {
  symbol: string;
  timeframe?: string;
  limit: number;
  credentials: AlpacaBarsCredentials;
  client?: AlpacaClient;
  /** Market data feed entitlement (default iex for paper). */
  feed?: string;
  /** Inclusive window start (ISO-8601). */
  start?: string;
  /** Inclusive window end (ISO-8601). */
  end?: string;
}

interface AlpacaBarRecord {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface AlpacaBarsResponse {
  bars?: AlpacaBarRecord[] | null;
  symbol?: string;
}

export interface FetchBarsResult {
  symbol: string;
  bars: OhlcBar[];
  /** Honest entitlement label — matches Alpaca adapter quote feed class. */
  feedClass: string;
  requestId: string | null;
}

export class BarsFetchError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'BarsFetchError';
  }
}

/**
 * Fetch historical OHLC bars from Alpaca market data API.
 * Stub-friendly: inject `client` with a mocked `fetchImpl` in tests.
 */
export async function fetchBars(params: FetchBarsParams): Promise<FetchBarsResult> {
  const upper = params.symbol.toUpperCase();
  const timeframe = params.timeframe ?? '1Min';
  const feed = params.feed ?? 'iex';
  const limit = Math.min(Math.max(1, params.limit), 10_000);

  const client =
    params.client ??
    createAlpacaClient({
      keyId: params.credentials.keyId,
      secret: params.credentials.secret,
    });

  let path =
    `/v2/stocks/${encodeURIComponent(upper)}/bars` +
    `?timeframe=${encodeURIComponent(timeframe)}` +
    `&limit=${limit}` +
    `&feed=${encodeURIComponent(feed)}`;
  if (params.start) {
    path += `&start=${encodeURIComponent(params.start)}`;
  }
  if (params.end) {
    path += `&end=${encodeURIComponent(params.end)}`;
  }

  const res = await client.getData<AlpacaBarsResponse>(path);
  if (!res.ok) {
    throw new BarsFetchError('bars_fetch_failed', res.errorBody ?? `status:${res.status}`);
  }

  const bars = (res.data?.bars ?? []).map((b): OhlcBar => ({
    timestamp: b.t,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
  }));

  return {
    symbol: upper,
    bars,
    feedClass: 'alpaca_iex_paper',
    requestId: res.requestId,
  };
}
