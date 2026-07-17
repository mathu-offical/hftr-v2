/**
 * Minimal Alpaca Trading + Market Data HTTP client (paper base URL by default).
 * Captures X-Request-ID on every response for reconciliation evidence.
 */

export const ALPACA_PAPER_BASE = 'https://paper-api.alpaca.markets';
export const ALPACA_DATA_BASE = 'https://data.alpaca.markets';

export interface AlpacaClientOptions {
  keyId: string;
  secret: string;
  tradingBaseUrl?: string;
  dataBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface AlpacaHttpResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  requestId: string | null;
  errorBody: string | null;
}

export function createAlpacaClient(opts: AlpacaClientOptions) {
  const tradingBase = opts.tradingBaseUrl ?? ALPACA_PAPER_BASE;
  const dataBase = opts.dataBaseUrl ?? ALPACA_DATA_BASE;
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;

  async function request<T>(
    base: string,
    path: string,
    init: RequestInit = {},
  ): Promise<AlpacaHttpResult<T>> {
    const headers = new Headers(init.headers);
    headers.set('APCA-API-KEY-ID', opts.keyId);
    headers.set('APCA-API-SECRET-KEY', opts.secret);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetchFn(`${base}${path}`, { ...init, headers });
    const requestId = res.headers.get('X-Request-ID');
    const text = await res.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        return { ok: false, status: res.status, data: null, requestId, errorBody: text };
      }
    }
    if (!res.ok) {
      return { ok: false, status: res.status, data, requestId, errorBody: text || null };
    }
    return { ok: true, status: res.status, data, requestId, errorBody: null };
  }

  return {
    tradingBase,
    dataBase,
    getTrading<T>(path: string): Promise<AlpacaHttpResult<T>> {
      return request<T>(tradingBase, path, { method: 'GET' });
    },
    postTrading<T>(path: string, body: unknown): Promise<AlpacaHttpResult<T>> {
      return request<T>(tradingBase, path, { method: 'POST', body: JSON.stringify(body) });
    },
    deleteTrading<T>(path: string): Promise<AlpacaHttpResult<T>> {
      return request<T>(tradingBase, path, { method: 'DELETE' });
    },
    getData<T>(path: string): Promise<AlpacaHttpResult<T>> {
      return request<T>(dataBase, path, { method: 'GET' });
    },
  };
}

export type AlpacaClient = ReturnType<typeof createAlpacaClient>;
