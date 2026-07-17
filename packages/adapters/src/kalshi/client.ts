import { constants, createPrivateKey, sign } from 'node:crypto';

/** Official Kalshi demo trade API (RSA-PSS signed requests). */
export const KALSHI_DEMO_API_ORIGIN = 'https://external-api.demo.kalshi.co';
export const KALSHI_DEMO_API_PREFIX = '/trade-api/v2';
export const KALSHI_DEMO_BASE_URL = `${KALSHI_DEMO_API_ORIGIN}${KALSHI_DEMO_API_PREFIX}`;

export const KALSHI_LIVE_API_ORIGIN = 'https://external-api.kalshi.com';

export interface KalshiClientOptions {
  apiKeyId: string;
  privateKeyPem: string;
  /** Demo-only until live gate ships — live mode is always rejected. */
  demoMode?: boolean;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
}

export interface KalshiHttpResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorBody: string | null;
}

export interface KalshiBalanceResponse {
  balance: number;
  portfolio_value: number;
  updated_ts: number;
}

export interface KalshiMarketSummary {
  ticker: string;
  event_ticker: string;
  title?: string;
  status: string;
  yes_bid_dollars: string;
  yes_ask_dollars: string;
  last_price_dollars: string;
}

export interface KalshiMarketsResponse {
  markets: KalshiMarketSummary[];
  cursor: string;
}

export interface KalshiMarketResponse {
  market: KalshiMarketSummary;
}

export interface KalshiEventResponse {
  event: {
    event_ticker: string;
    title?: string;
    markets?: KalshiMarketSummary[];
  };
}

export interface KalshiCreateOrderBody {
  ticker: string;
  client_order_id?: string;
  side: 'bid' | 'ask';
  count: string;
  price: string;
  time_in_force: 'fill_or_kill' | 'good_till_canceled' | 'immediate_or_cancel';
  self_trade_prevention_type: 'taker_at_cross' | 'maker';
  post_only?: boolean;
  cancel_order_on_pause?: boolean;
  reduce_only?: boolean;
}

export interface KalshiCreateOrderResponse {
  order_id: string;
  client_order_id?: string;
  fill_count: string;
  remaining_count: string;
  average_fill_price?: string;
  ts_ms: number;
}

export function signKalshiRequest(
  privateKeyPem: string,
  timestampMs: string,
  method: string,
  pathWithoutQuery: string,
): string {
  const message = `${timestampMs}${method.toUpperCase()}${pathWithoutQuery}`;
  const key = createPrivateKey(privateKeyPem);
  const signature = sign('RSA-SHA256', Buffer.from(message, 'utf8'), {
    key,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return signature.toString('base64');
}

function signingPath(apiPrefix: string, relativePath: string): string {
  const withoutQuery = relativePath.split('?')[0] ?? relativePath;
  return `${apiPrefix}${withoutQuery}`;
}

export function createKalshiClient(opts: KalshiClientOptions) {
  const demoMode = opts.demoMode ?? true;
  if (!demoMode) {
    throw new Error('kalshi_live_not_supported');
  }

  const baseUrl = opts.baseUrl ?? KALSHI_DEMO_BASE_URL;
  const origin = baseUrl.startsWith(KALSHI_LIVE_API_ORIGIN)
    ? KALSHI_LIVE_API_ORIGIN
    : KALSHI_DEMO_API_ORIGIN;
  const apiPrefix = baseUrl.replace(origin, '') || KALSHI_DEMO_API_PREFIX;
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const nowMs = opts.nowMs ?? (() => Date.now());

  async function request<T>(
    method: string,
    relativePath: string,
    body?: unknown,
  ): Promise<KalshiHttpResult<T>> {
    const timestamp = String(nowMs());
    const signPath = signingPath(apiPrefix, relativePath);
    const signature = signKalshiRequest(opts.privateKeyPem, timestamp, method, signPath);

    const headers = new Headers({
      'KALSHI-ACCESS-KEY': opts.apiKeyId,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
    });
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetchFn(`${origin}${apiPrefix}${relativePath}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await res.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        return { ok: false, status: res.status, data: null, errorBody: text };
      }
    }
    if (!res.ok) {
      return { ok: false, status: res.status, data, errorBody: text || null };
    }
    return { ok: true, status: res.status, data, errorBody: null };
  }

  return {
    baseUrl,
    demoMode,

    async verifyConnection(): Promise<boolean> {
      const res = await request<KalshiBalanceResponse>('GET', '/portfolio/balance');
      return res.ok && res.data != null;
    },

    async getBalance(): Promise<KalshiBalanceResponse> {
      const res = await request<KalshiBalanceResponse>('GET', '/portfolio/balance');
      if (!res.ok || !res.data) {
        throw new Error('kalshi_balance_unavailable');
      }
      return res.data;
    },

    async getMarkets(params?: {
      limit?: number;
      cursor?: string;
      status?: string;
      eventTicker?: string;
    }): Promise<KalshiMarketsResponse> {
      const search = new URLSearchParams();
      if (params?.limit != null) search.set('limit', String(params.limit));
      if (params?.cursor) search.set('cursor', params.cursor);
      if (params?.status) search.set('status', params.status);
      if (params?.eventTicker) search.set('event_ticker', params.eventTicker);
      const qs = search.toString();
      const path = qs ? `/markets?${qs}` : '/markets';
      const res = await request<KalshiMarketsResponse>('GET', path);
      if (!res.ok || !res.data) {
        throw new Error('kalshi_markets_unavailable');
      }
      return res.data;
    },

    async getEvent(eventTicker: string): Promise<KalshiEventResponse> {
      const res = await request<KalshiEventResponse>(
        'GET',
        `/events/${encodeURIComponent(eventTicker)}`,
      );
      if (!res.ok || !res.data) {
        throw new Error('kalshi_event_unavailable');
      }
      return res.data;
    },

    async getMarket(ticker: string): Promise<KalshiMarketResponse> {
      const res = await request<KalshiMarketResponse>(
        'GET',
        `/markets/${encodeURIComponent(ticker)}`,
      );
      if (!res.ok || !res.data) {
        throw new Error('kalshi_market_unavailable');
      }
      return res.data;
    },

    async placeOrder(body: KalshiCreateOrderBody): Promise<KalshiCreateOrderResponse> {
      const res = await request<KalshiCreateOrderResponse>(
        'POST',
        '/portfolio/events/orders',
        body,
      );
      if (!res.ok || !res.data) {
        throw new Error('kalshi_order_rejected');
      }
      return res.data;
    },
  };
}

export type KalshiClient = ReturnType<typeof createKalshiClient>;

export function dollarsToCents(dollars: string | number): number {
  const n = typeof dollars === 'string' ? Number.parseFloat(dollars) : dollars;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(4);
}

export function formatContractCountFp(quantityInt: string, quantityScale: number): string {
  if (quantityScale === 0) return `${quantityInt}.00`;
  const negative = quantityInt.startsWith('-');
  const digits = negative ? quantityInt.slice(1) : quantityInt;
  const padded = digits.padStart(quantityScale + 1, '0');
  const whole = padded.slice(0, -quantityScale) || '0';
  const frac = padded.slice(-quantityScale).padEnd(2, '0').slice(0, 2);
  return `${negative ? '-' : ''}${whole}.${frac}`;
}
