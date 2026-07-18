/**
 * Trader-style interactive session against persistent Chrome CDP.
 * Behaves like a paper day-trader: scan posture → trends → promote → trade → monitor.
 *
 * Usage:
 *   REUSE_COMPANY_ID=<uuid> pnpm exec tsx scripts/cdp-trader-session.ts
 *   (omit REUSE to create a fresh day-trading company)
 */
import { chromium, type Page } from 'playwright';

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3001';

type Note = { step: string; ok: boolean; detail?: unknown };
const log: Note[] = [];
function note(step: string, ok: boolean, detail?: unknown) {
  const row = { step, ok, detail };
  log.push(row);
  console.log(JSON.stringify(row));
}

async function waitHealth(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8_000) });
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return false;
}

async function api<T = unknown>(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  let json: T | string;
  try {
    json = JSON.parse(text) as T;
  } catch {
    json = text.slice(0, 500);
  }
  return { status: res.status, json };
}

async function expandLeft(page: Page) {
  const expand = page.getByRole('button', { name: /Expand left panel/ });
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
    await page.waitForTimeout(500);
  }
}

async function expandBottom(page: Page) {
  const expand = page.getByRole('button', { name: /Expand bottom panel/ });
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
    await page.waitForTimeout(500);
  }
}

async function ensureCompany(): Promise<{ cid: string; name: string; trendId: string; tradingId: string }> {
  const reuse = process.env.REUSE_COMPANY_ID?.trim();
  if (reuse) {
    const detail = await api<{
      company: { name: string };
      modules: Array<{ id: string; type: string; status: string }>;
    }>('GET', `/api/companies/${reuse}`);
    const modules = (detail.json as { modules: Array<{ id: string; type: string; status: string }> }).modules;
    const trend = modules.find((m) => m.type === 'trend')!;
    const trading = modules.find((m) => m.type === 'trading')!;
    if (trend.status !== 'active') {
      await api('PATCH', `/api/companies/${reuse}/modules/${trend.id}`, {
        status: 'active',
        setup: { topicSectors: ['Large-cap technology'] },
      });
    }
    if (trading.status !== 'active') {
      await api('PATCH', `/api/companies/${reuse}/modules/${trading.id}`, {
        status: 'active',
        setup: {
          topicSectors: ['Large-cap technology'],
          capitalAllocation: { mode: 'percentage', value: '25' },
          targetExitAt: '2099-12-15T20:00:00.000Z',
          timezone: 'America/New_York',
        },
      });
    }
    return {
      cid: reuse,
      name: (detail.json as { company: { name: string } }).company.name,
      trendId: trend.id,
      tradingId: trading.id,
    };
  }

  const name = `Desk ${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
  const created = await api<{ company: { id: string } }>('POST', '/api/companies', {
    name,
    philosophyPrompt:
      'Paper day desk — trade liquid large-cap tech with tight risk, respect session exits, no live.',
    mode: 'paper',
    seedCreditsCents: 2_000_000,
    engines: [{ templateId: 'engine_day_trading', inputs: {} }],
  });
  if (typeof created.json === 'string' || !('company' in created.json)) {
    throw new Error(`create failed ${created.status}`);
  }
  const cid = created.json.company.id;
  const detail = await api<{ modules: Array<{ id: string; type: string }> }>('GET', `/api/companies/${cid}`);
  const modules = (detail.json as { modules: Array<{ id: string; type: string }> }).modules;
  const trend = modules.find((m) => m.type === 'trend')!;
  const trading = modules.find((m) => m.type === 'trading')!;
  await api('PATCH', `/api/companies/${cid}/modules/${trend.id}`, {
    status: 'active',
    setup: { topicSectors: ['Large-cap technology'] },
  });
  await api('PATCH', `/api/companies/${cid}/modules/${trading.id}`, {
    status: 'active',
    setup: {
      topicSectors: ['Large-cap technology'],
      capitalAllocation: { mode: 'percentage', value: '25' },
      targetExitAt: '2099-12-15T20:00:00.000Z',
      timezone: 'America/New_York',
    },
  });
  return { cid, name, trendId: trend.id, tradingId: trading.id };
}

async function main() {
  note('health', await waitHealth());
  if (!log[0]?.ok) process.exit(1);

  const company = await ensureCompany();
  note('desk_ready', true, company);

  // --- Operator API moves a trader would trigger from the desk ---
  // 1) Refresh market hub / posture
  const hub = await api('POST', `/api/companies/${company.cid}/market-hub`, {});
  note('hub_refresh', hub.status === 200, (hub.json as { drained?: unknown }).drained ?? hub.json);

  // 2) Add / confirm a trend candidate (MSFT up)
  const trendsList = await api<{ trends?: Array<{ id: string; symbol: string }> }>(
    'GET',
    `/api/companies/${company.cid}/trends`,
  );
  let trendRowId: string | undefined;
  const existing = typeof trendsList.json === 'object' && trendsList.json && 'trends' in trendsList.json
    ? trendsList.json.trends
    : Array.isArray(trendsList.json)
      ? (trendsList.json as Array<{ id: string; symbol: string }>)
      : [];
  const msft = existing?.find((t) => t.symbol === 'MSFT');
  if (msft) {
    trendRowId = msft.id;
    note('trend_candidate', true, { reused: msft.id });
  } else {
    const tr = await api<{ trend: { id: string } }>('POST', `/api/companies/${company.cid}/trends`, {
      moduleId: company.trendId,
      symbol: 'MSFT',
      direction: 'up',
      strengthBand: 'strong',
    });
    trendRowId = (tr.json as { trend: { id: string } }).trend.id;
    note('trend_candidate', tr.status === 200 || tr.status === 201, trendRowId);
  }

  // 3) Promote MSFT into trading (pipeline)
  if (trendRowId) {
    const promo = await api('POST', `/api/companies/${company.cid}/modules/${company.trendId}/promote`, {
      trendId: trendRowId,
      targetModuleId: company.tradingId,
    });
    note('promote', promo.status === 200, (promo.json as { drained?: unknown }).drained ?? promo.json);
  }

  // 4) Scale into NVDA as a second name (manual paper buy — small size)
  const buy = await api('POST', `/api/companies/${company.cid}/modules/${company.tradingId}/trade`, {
    actionVerb: 'buy',
    symbol: 'NVDA',
    quantity: 1,
    orderType: 'market',
  });
  note('buy_nvda', buy.status === 200, buy.json);

  // 5) Add AAPL as watch / trade
  const buy2 = await api('POST', `/api/companies/${company.cid}/modules/${company.tradingId}/trade`, {
    actionVerb: 'buy',
    symbol: 'AAPL',
    quantity: 2,
    orderType: 'market',
  });
  note('buy_aapl', buy2.status === 200, buy2.json);

  // Snapshot book
  const positions = await api<{ positions?: unknown[] }>('GET', `/api/companies/${company.cid}/positions`);
  const executions = await api<{ executions?: unknown[] }>('GET', `/api/companies/${company.cid}/executions`);
  const activity = await api<{ balanceCents?: string; ledger?: unknown[] }>(
    'GET',
    `/api/companies/${company.cid}/activity`,
  );
  note('book_positions', positions.status === 200, {
    n: Array.isArray((positions.json as { positions?: unknown[] }).positions)
      ? (positions.json as { positions: unknown[] }).positions.length
      : positions.json,
  });
  note('book_executions', executions.status === 200, {
    n: Array.isArray((executions.json as { executions?: unknown[] }).executions)
      ? (executions.json as { executions: unknown[] }).executions.length
      : executions.json,
  });
  note('book_activity', activity.status === 200, {
    balanceCents: (activity.json as { balanceCents?: string }).balanceCents,
    ledgerN: Array.isArray((activity.json as { ledger?: unknown[] }).ledger)
      ? (activity.json as { ledger: unknown[] }).ledger.length
      : undefined,
  });

  // --- UI: walk the desk like a human ---
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  let page = context.pages().find((p) => p.url().includes('127.0.0.1:3001'));
  if (!page) page = context.pages()[0] ?? (await context.newPage());

  await page.goto(`${BASE}/companies/${company.cid}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
  await page.getByRole('button', { name: 'Live trading (gated)' }).waitFor({
    state: 'visible',
    timeout: 120_000,
  });
  note('ui_open_desk', true, page.url());

  // Check live remains gated (trader habit)
  const live = page.getByRole('button', { name: 'Live trading (gated)' });
  await live.click({ force: true });
  await page.waitForTimeout(400);
  note(
    'ui_live_still_gated',
    await page.getByText('Live trading is gated.').isVisible().catch(() => false),
  );
  await live.click({ force: true });

  // Bottom: Trends → Executions
  await expandBottom(page);
  const bottom = page.getByRole('tablist', { name: 'Bottom panel sections' });
  await bottom.getByRole('tab', { name: 'Trends' }).click();
  await page.waitForTimeout(1000);
  note(
    'ui_trends',
    await page.getByText(/MSFT|Trend|Promote|candidate/i).first().isVisible().catch(() => false),
  );

  const right = page.getByRole('tablist', { name: 'Info panel sections' });
  const expandRight = page.getByRole('button', { name: /Expand info panel/ });
  if (await expandRight.isVisible().catch(() => false)) await expandRight.click();
  await right.getByRole('tab', { name: 'Executions' }).click();
  await page.waitForTimeout(1200);
  note(
    'ui_fills',
    await page.getByText(/filled|NVDA|AAPL|paper/i).first().isVisible().catch(() => false),
  );

  // Left: Posture dashboard
  await expandLeft(page);
  await page.getByRole('tab', { name: 'Posture' }).click();
  await page.waitForTimeout(1000);
  note(
    'ui_posture',
    await page.getByTestId('market-posture-panel').isVisible().catch(() => false),
  );
  note(
    'ui_posture_overlay',
    await page.getByTestId('market-posture-overlay').isVisible().catch(() => false),
  );

  // Hub refresh from the page (trader hits refresh)
  const hubUi = await page.evaluate(async (cid) => {
    const r = await fetch(`/api/companies/${cid}/market-hub`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, drained: j.drained, enqueued: j.enqueued };
  }, company.cid);
  note('ui_hub_refresh', hubUi.status === 200, hubUi);

  // Optional: try a small sell if we have open AAPL (trim)
  const posJson = positions.json as {
    positions?: Array<{ id: string; symbol: string; qty: string }>;
  };
  const aaplOpen = posJson.positions?.find((p) => p.symbol === 'AAPL' && Number(p.qty) > 0);
  if (aaplOpen) {
    const sell = await api('POST', `/api/companies/${company.cid}/modules/${company.tradingId}/trade`, {
      actionVerb: 'sell',
      symbol: 'AAPL',
      quantity: 1,
      orderType: 'market',
    });
    note('trim_aapl', sell.status === 200, sell.json);
  } else {
    note('trim_aapl', true, 'no open AAPL to trim');
  }

  // Final book after trim
  const finalPos = await api<{ positions?: unknown[] }>('GET', `/api/companies/${company.cid}/positions`);
  const finalExec = await api<{ executions?: unknown[] }>('GET', `/api/companies/${company.cid}/executions`);
  note('final_positions', finalPos.status === 200, {
    n: (finalPos.json as { positions?: unknown[] }).positions?.length,
    symbols: ((finalPos.json as { positions?: Array<{ symbol: string; qty: string }> }).positions ?? []).map(
      (p) => `${p.symbol}:${p.qty}`,
    ),
  });
  note('final_executions', finalExec.status === 200, {
    n: (finalExec.json as { executions?: unknown[] }).executions?.length,
  });

  // Leave browser on posture for continued watching
  await page.goto(`${BASE}/companies/${company.cid}`, { waitUntil: 'domcontentloaded' });
  await expandLeft(page);
  if (await page.getByRole('tab', { name: 'Posture' }).isVisible().catch(() => false)) {
    await page.getByRole('tab', { name: 'Posture' }).click();
  }

  const summary = {
    companyId: company.cid,
    companyName: company.name,
    passed: log.filter((s) => s.ok).length,
    failed: log.filter((s) => !s.ok).length,
    steps: log,
  };
  console.log('SUMMARY', JSON.stringify(summary, null, 2));
  await browser.close();
  console.log('CDP disconnected; Chrome left on', `${BASE}/companies/${company.cid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
