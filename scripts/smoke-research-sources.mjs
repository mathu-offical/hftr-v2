#!/usr/bin/env node
/**
 * Opt-in credentialed smoke against research gather sources.
 * Never logs secret values.
 */
const HELP = `smoke-research-sources — opt-in research source connectivity smoke

Usage:
  node scripts/smoke-research-sources.mjs [--help]
  pnpm smoke:research

Environment (automation path):
  HFTR_RESEARCH_SMOKE=1           Required to run (otherwise exits 0 with skip)
  BRAVE_API_KEY                   Optional — Brave web search
  MARKETAUX_API_KEY               Optional — Marketaux news (alias: MARKET_NEWS_API_KEY)
  MARKET_NEWS_API_KEY             Optional alias for MARKETAUX_API_KEY
  ALPACA_PAPER_KEY                Optional — Alpaca data news (with ALPACA_PAPER_SECRET)
  ALPACA_PAPER_SECRET             Optional — alias key id: ALPACA_PAPER_KEY_ID
  FINNHUB_API_KEY                 Optional — Finnhub company/general news
  POLYGON_API_KEY                 Optional — Polygon.io reference news

Runtime gather uses user-saved research keys (D-039). Env keys are CI/smoke only.

Exits 0 when all present keys pass or none are set; non-zero if any present key fails auth.
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

if (process.env.HFTR_RESEARCH_SMOKE !== '1') {
  console.log('skip: set HFTR_RESEARCH_SMOKE=1 to run credentialed research source smoke');
  process.exit(0);
}

/**
 * @param {string} label
 * @param {() => Promise<{ ok: boolean; failure?: string }>}
 */
async function runCheck(label, fn) {
  try {
    const outcome = await fn();
    if (outcome.ok) {
      console.log(`${label}: ok`);
      return true;
    }
    console.log(`${label}: fail (${outcome.failure ?? 'unknown'})`);
    return false;
  } catch {
    console.log(`${label}: fail (network_error)`);
    return false;
  }
}

/**
 * @param {string} apiKey
 */
async function verifyBrave(apiKey) {
  const url =
    'https://api.search.brave.com/res/v1/web/search' +
    `?q=${encodeURIComponent('connectivity')}&count=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, failure: 'auth_rejected' };
    }
    if (!res.ok) {
      return { ok: false, failure: `http_${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, failure: 'ping_timeout' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} apiKey
 */
async function verifyMarketaux(apiKey) {
  const url = `https://api.marketaux.com/v1/news/all?api_token=${encodeURIComponent(apiKey)}&limit=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, failure: 'auth_rejected' };
    }
    if (!res.ok) {
      return { ok: false, failure: `http_${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, failure: 'ping_timeout' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} keyId
 * @param {string} secret
 */
async function verifyAlpacaNews(keyId, secret) {
  const url = 'https://data.alpaca.markets/v1beta1/news?limit=1';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'APCA-API-KEY-ID': keyId,
        'APCA-API-SECRET-KEY': secret,
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, failure: 'auth_rejected' };
    }
    if (!res.ok) {
      return { ok: false, failure: `http_${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, failure: 'ping_timeout' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} apiKey
 */
async function verifyFinnhub(apiKey) {
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - 7);
  const from = fromDate.toISOString().slice(0, 10);
  const url =
    `https://finnhub.io/api/v1/company-news` +
    `?symbol=AAPL&from=${from}&to=${to}&token=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, failure: 'auth_rejected' };
    }
    if (!res.ok) {
      return { ok: false, failure: `http_${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, failure: 'ping_timeout' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} apiKey
 */
async function verifyPolygon(apiKey) {
  const url = `https://api.polygon.io/v2/reference/news?limit=1&apiKey=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, failure: 'auth_rejected' };
    }
    if (!res.ok) {
      return { ok: false, failure: `http_${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, failure: 'ping_timeout' };
  } finally {
    clearTimeout(timer);
  }
}

let anyPresent = false;
let anyFailed = false;

const braveKey = (process.env.BRAVE_API_KEY ?? '').trim();
if (braveKey) {
  anyPresent = true;
  const ok = await runCheck('brave_search', () => verifyBrave(braveKey));
  if (!ok) anyFailed = true;
} else {
  console.log('brave_search: skip (no BRAVE_API_KEY)');
}

const marketNewsKey = (
  process.env.MARKETAUX_API_KEY ??
  process.env.MARKET_NEWS_API_KEY ??
  ''
).trim();
if (marketNewsKey) {
  anyPresent = true;
  const ok = await runCheck('market_news', () => verifyMarketaux(marketNewsKey));
  if (!ok) anyFailed = true;
} else {
  console.log('market_news: skip (no MARKETAUX_API_KEY or MARKET_NEWS_API_KEY)');
}

const alpacaKey = (process.env.ALPACA_PAPER_KEY ?? process.env.ALPACA_PAPER_KEY_ID ?? '').trim();
const alpacaSecret = (process.env.ALPACA_PAPER_SECRET ?? '').trim();
if (alpacaKey && alpacaSecret) {
  anyPresent = true;
  const ok = await runCheck('alpaca_news', () => verifyAlpacaNews(alpacaKey, alpacaSecret));
  if (!ok) anyFailed = true;
} else if (alpacaKey || alpacaSecret) {
  anyPresent = true;
  anyFailed = true;
  console.log('alpaca_news: fail (incomplete ALPACA_PAPER_KEY + ALPACA_PAPER_SECRET)');
} else {
  console.log('alpaca_news: skip (no ALPACA_PAPER_KEY + ALPACA_PAPER_SECRET)');
}

const finnhubKey = (process.env.FINNHUB_API_KEY ?? '').trim();
if (finnhubKey) {
  anyPresent = true;
  const ok = await runCheck('finnhub_news', () => verifyFinnhub(finnhubKey));
  if (!ok) anyFailed = true;
} else {
  console.log('finnhub_news: skip (no FINNHUB_API_KEY)');
}

const polygonKey = (process.env.POLYGON_API_KEY ?? '').trim();
if (polygonKey) {
  anyPresent = true;
  const ok = await runCheck('polygon_news', () => verifyPolygon(polygonKey));
  if (!ok) anyFailed = true;
} else {
  console.log('polygon_news: skip (no POLYGON_API_KEY)');
}

if (!anyPresent) {
  console.log('skip: no research API keys set in environment');
  process.exit(0);
}

process.exit(anyFailed ? 1 : 0);
