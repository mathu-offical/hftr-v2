import type { ResearchKeyProvider } from '@hftr/contracts';

const PING_TIMEOUT_MS = 8_000;

export interface ResearchKeyVerifyOutcome {
  ok: boolean;
  failure?: string;
}

async function ping(url: string, init: RequestInit): Promise<ResearchKeyVerifyOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, failure: 'auth_rejected' };
    }
    if (!res.ok) {
      return { ok: false, failure: `provider_http_${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, failure: 'ping_timeout' };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyBrave(apiKey: string): Promise<ResearchKeyVerifyOutcome> {
  const url =
    'https://api.search.brave.com/res/v1/web/search' +
    `?q=${encodeURIComponent('connectivity')}&count=1`;
  return ping(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });
}

async function verifyMarketaux(apiKey: string): Promise<ResearchKeyVerifyOutcome> {
  const url = `https://api.marketaux.com/v1/news/all?api_token=${encodeURIComponent(apiKey)}&limit=1`;
  return ping(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

async function verifyFinnhub(apiKey: string): Promise<ResearchKeyVerifyOutcome> {
  const url =
    'https://finnhub.io/api/v1/news' + `?category=general&token=${encodeURIComponent(apiKey)}`;
  return ping(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

async function verifyPolygon(apiKey: string): Promise<ResearchKeyVerifyOutcome> {
  const url = `https://api.polygon.io/v2/reference/news?limit=1&apiKey=${encodeURIComponent(apiKey)}`;
  return ping(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

async function verifyFred(apiKey: string): Promise<ResearchKeyVerifyOutcome> {
  const url =
    'https://api.stlouisfed.org/fred/series/search' +
    `?search_text=gdp&api_key=${encodeURIComponent(apiKey)}&file_type=json&limit=1`;
  return ping(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

async function verifyAlphaVantage(apiKey: string): Promise<ResearchKeyVerifyOutcome> {
  const url =
    'https://www.alphavantage.co/query' +
    `?function=NEWS_SENTIMENT&limit=1&apikey=${encodeURIComponent(apiKey)}`;
  return ping(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

async function verifyTwelveData(apiKey: string): Promise<ResearchKeyVerifyOutcome> {
  const url =
    'https://api.twelvedata.com/time_series' +
    `?symbol=AAPL&interval=1day&outputsize=1&apikey=${encodeURIComponent(apiKey)}`;
  return ping(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

async function verifyMarketstack(apiKey: string): Promise<ResearchKeyVerifyOutcome> {
  const url =
    'https://api.marketstack.com/v1/eod' +
    `?access_key=${encodeURIComponent(apiKey)}&symbols=AAPL&limit=1`;
  return ping(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

/**
 * Decrypt-then-verify user research gather keys. Never logs or returns plaintext.
 * Pings mirror scripts/smoke-research-sources.mjs (spend-minimal list/count=1).
 */
export async function verifyResearchProviderKey(
  provider: ResearchKeyProvider,
  apiKey: string,
): Promise<ResearchKeyVerifyOutcome> {
  if (apiKey.length < 8) {
    return { ok: false, failure: 'key_too_short' };
  }

  switch (provider) {
    case 'brave':
      return verifyBrave(apiKey);
    case 'market_news':
      return verifyMarketaux(apiKey);
    case 'finnhub':
      return verifyFinnhub(apiKey);
    case 'polygon':
      return verifyPolygon(apiKey);
    case 'fred':
      return verifyFred(apiKey);
    case 'alpha_vantage':
      return verifyAlphaVantage(apiKey);
    case 'twelve_data':
      return verifyTwelveData(apiKey);
    case 'marketstack':
      return verifyMarketstack(apiKey);
    default: {
      const _exhaustive: never = provider;
      return { ok: false, failure: `unsupported_provider:${String(_exhaustive)}` };
    }
  }
}
