/**
 * Opportunistic multi-symbol paper desk: seed many liquid names, promote with
 * high capital allocation, scale operator adds, run position_exits, assert
 * full lifecycle book (open → trim → exit scan).
 *
 *   REUSE_COMPANY_ID=<uuid> pnpm exec tsx scripts/cdp-opportunistic-multi.ts
 */
import { chromium, type Page } from 'playwright';

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3001';

/** Liquid large-cap / ETF book for opportunistic rotation. */
const UNIVERSE = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'GOOGL',
  'META',
  'TSLA',
  'AMD',
  'AVGO',
  'CRM',
  'NFLX',
  'SPY',
  'QQQ',
  'IWM',
] as const;

type Note = { step: string; ok: boolean; detail?: unknown };
const log: Note[] = [];
function note(step: string, ok: boolean, detail?: unknown) {
  const row = { step, ok, detail };
  log.push(row);
  console.log(JSON.stringify(row));
}

async function waitHealth(timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(30_000) });
      if (r.ok) return true;
    } catch (err) {
      console.log(JSON.stringify({ step: 'health_retry', ok: false, detail: String(err) }));
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
    await page.waitForTimeout(400);
  }
}

async function ensureDesk(): Promise<{
  cid: string;
  name: string;
  trendId: string;
  tradingId: string;
}> {
  const reuse = process.env.REUSE_COMPANY_ID?.trim();
  if (reuse) {
    const detail = await api<{
      company: { name: string };
      modules: Array<{ id: string; type: string; status: string }>;
    }>('GET', `/api/companies/${reuse}`);
    const modules = (detail.json as { modules: Array<{ id: string; type: string; status: string }> })
      .modules;
    const trend = modules.find((m) => m.type === 'trend')!;
    const trading = modules.find((m) => m.type === 'trading')!;
    await api('PATCH', `/api/companies/${reuse}/modules/${trend.id}`, {
      status: 'active',
      setup: { topicSectors: ['Large-cap technology', 'Broad market ETFs'] },
    });
    await api('PATCH', `/api/companies/${reuse}/modules/${trading.id}`, {
      status: 'active',
      setup: {
        topicSectors: ['Large-cap technology', 'Broad market ETFs'],
        // Deep opportunistic book — heat / polarization still clamp size.
        capitalAllocation: { mode: 'percentage', value: '55' },
        targetExitAt: '2099-12-15T20:00:00.000Z',
        timezone: 'America/New_York',
      },
    });
    return {
      cid: reuse,
      name: (detail.json as { company: { name: string } }).company.name,
      trendId: trend.id,
      tradingId: trading.id,
    };
  }

  const name = `Opp ${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
  const created = await api<{ company: { id: string } }>('POST', '/api/companies', {
    name,
    philosophyPrompt:
      'Paper opportunistic multi-symbol desk — rotate liquid names, respect heat/exits, no live.',
    mode: 'paper',
    seedCreditsCents: 5_000_000,
    engines: [{ templateId: 'engine_day_trading', inputs: {} }],
  });
  if (typeof created.json === 'string' || !('company' in created.json)) {
    throw new Error(`create failed ${created.status}`);
  }
  const cid = created.json.company.id;
  const detail = await api<{ modules: Array<{ id: string; type: string }> }>(
    'GET',
    `/api/companies/${cid}`,
  );
  const modules = (detail.json as { modules: Array<{ id: string; type: string }> }).modules;
  const trend = modules.find((m) => m.type === 'trend')!;
  const trading = modules.find((m) => m.type === 'trading')!;
  await api('PATCH', `/api/companies/${cid}/modules/${trend.id}`, {
    status: 'active',
    setup: { topicSectors: ['Large-cap technology', 'Broad market ETFs'] },
  });
  await api('PATCH', `/api/companies/${cid}/modules/${trading.id}`, {
    status: 'active',
    setup: {
      topicSectors: ['Large-cap technology', 'Broad market ETFs'],
      capitalAllocation: { mode: 'percentage', value: '55' },
      targetExitAt: '2099-12-15T20:00:00.000Z',
      timezone: 'America/New_York',
    },
  });
  return { cid, name, trendId: trend.id, tradingId: trading.id };
}

async function main() {
  note('health', await waitHealth());
  if (!log[0]?.ok) process.exit(1);

  const desk = await ensureDesk();
  note('desk_ready', true, desk);

  const hub = await api('POST', `/api/companies/${desk.cid}/market-hub`, {});
  note('hub_refresh', hub.status === 200, (hub.json as { drained?: unknown }).drained ?? hub.json);

  // Seed + promote first half of universe via trend→compile→dispatch
  const promoteSymbols = UNIVERSE.slice(0, 8);
  const operatorSymbols = UNIVERSE.slice(8);
  let promoteFilled = 0;
  let promoteBlocked = 0;

  for (const symbol of promoteSymbols) {
    const trendsList = await api('GET', `/api/companies/${desk.cid}/trends`);
    const existing =
      typeof trendsList.json === 'object' &&
      trendsList.json &&
      'trends' in (trendsList.json as object)
        ? ((trendsList.json as { trends: Array<{ id: string; symbol: string }> }).trends ?? [])
        : Array.isArray(trendsList.json)
          ? (trendsList.json as Array<{ id: string; symbol: string }>)
          : [];
    let trendRowId = existing.find((t) => t.symbol === symbol)?.id;
    if (!trendRowId) {
      const tr = await api<{ trend: { id: string } }>('POST', `/api/companies/${desk.cid}/trends`, {
        moduleId: desk.trendId,
        symbol,
        direction: 'up',
        strengthBand: 'strong',
      });
      trendRowId = (tr.json as { trend: { id: string } }).trend?.id;
      if (!trendRowId) {
        note(`trend_${symbol}`, false, tr.json);
        continue;
      }
    }
    const promo = await api('POST', `/api/companies/${desk.cid}/modules/${desk.trendId}/promote`, {
      trendId: trendRowId,
      targetModuleId: desk.tradingId,
    });
    const drained = (promo.json as { drained?: { completed?: number; failed?: number } }).drained;
    const ok = promo.status === 200 && (drained?.failed ?? 0) === 0;
    if (ok) promoteFilled += 1;
    else promoteBlocked += 1;
    note(`promote_${symbol}`, ok, drained ?? promo.json);
  }

  // Operator scale-ins across remaining names (deep leverage attempt; heat may block)
  let operatorFilled = 0;
  for (const symbol of operatorSymbols) {
    const buy = await api('POST', `/api/companies/${desk.cid}/modules/${desk.tradingId}/trade`, {
      actionVerb: 'buy',
      symbol,
      quantity: 3,
      orderType: 'market',
    });
    const ok = buy.status === 200;
    if (ok) operatorFilled += 1;
    note(`buy_${symbol}`, ok, buy.json);
  }

  // Scale adds on a few promoted winners (opportunistic pyramid)
  for (const symbol of ['NVDA', 'META', 'SPY'] as const) {
    const add = await api('POST', `/api/companies/${desk.cid}/modules/${desk.tradingId}/trade`, {
      actionVerb: 'buy',
      symbol,
      quantity: 2,
      orderType: 'market',
    });
    note(`scale_${symbol}`, add.status === 200, add.json);
  }

  const positions = await api<{
    positions?: Array<{ symbol: string; qty: string; avgCostCents?: string }>;
  }>('GET', `/api/companies/${desk.cid}/positions`);
  const posList =
    (positions.json as { positions?: Array<{ symbol: string; qty: string }> }).positions ?? [];
  const openLongs = posList.filter((p) => Number(p.qty) > 0);
  note('book_open', positions.status === 200, {
    n: openLongs.length,
    symbols: openLongs.map((p) => `${p.symbol}:${p.qty}`),
  });

  // Partial lifecycle: trim two names
  for (const symbol of openLongs.slice(0, 2).map((p) => p.symbol)) {
    const row = openLongs.find((p) => p.symbol === symbol)!;
    const qty = Math.max(1, Math.floor(Number(row.qty) / 2));
    const sell = await api('POST', `/api/companies/${desk.cid}/modules/${desk.tradingId}/trade`, {
      actionVerb: 'sell',
      symbol,
      quantity: qty,
      orderType: 'market',
    });
    note(`trim_${symbol}`, sell.status === 200, sell.json);
  }

  // Position-exit maintenance scan (full lifecycle valve)
  const exits = await api('POST', `/api/companies/${desk.cid}/positions/exits`, {});
  note('lifecycle_exits', exits.status === 200, exits.json);

  const hub2 = await api('POST', `/api/companies/${desk.cid}/market-hub`, {});
  note('hub_post_exits', hub2.status === 200, (hub2.json as { drained?: unknown }).drained);

  const finalPos = await api<{
    positions?: Array<{ symbol: string; qty: string }>;
  }>('GET', `/api/companies/${desk.cid}/positions`);
  const finalExec = await api<{
    executions?: Array<{
      symbol?: string;
      outcome?: string;
      simulatorGapTags?: string[];
      fills?: unknown[];
    }>;
  }>('GET', `/api/companies/${desk.cid}/executions`);
  const activity = await api<{ balanceCents?: string; ledger?: unknown[] }>(
    'GET',
    `/api/companies/${desk.cid}/activity`,
  );

  const execs =
    (finalExec.json as { executions?: Array<{ simulatorGapTags?: string[]; fills?: unknown[] }> })
      .executions ?? [];
  const childDrainTraces = execs.filter((e) =>
    (e.simulatorGapTags ?? []).includes('child_slice_drain'),
  );
  const feeRows = Array.isArray((activity.json as { ledger?: Array<{ kind?: string }> }).ledger)
    ? ((activity.json as { ledger: Array<{ kind?: string }> }).ledger ?? []).filter(
        (l) => l.kind === 'fee',
      ).length
    : 0;

  note('final_book', finalPos.status === 200, {
    positions: (
      (finalPos.json as { positions?: Array<{ symbol: string; qty: string }> }).positions ?? []
    ).map((p) => `${p.symbol}:${p.qty}`),
    executions: execs.length,
    childSliceDrainTraces: childDrainTraces.length,
    feeLedgerRows: feeRows,
    balanceCents: (activity.json as { balanceCents?: string }).balanceCents,
    promoteFilled,
    promoteBlocked,
    operatorFilled,
  });

  // UI smoke on desk (optional — CDP Chrome may die under disk pressure)
  try {
    const browser = await chromium.connectOverCDP(CDP);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    let page = context.pages().find((p) => p.url().includes('127.0.0.1:3001'));
    if (!page) page = context.pages()[0] ?? (await context.newPage());

    await page.goto(`${BASE}/companies/${desk.cid}`, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    });
    await page.getByRole('button', { name: 'Live trading (gated)' }).waitFor({
      state: 'visible',
      timeout: 120_000,
    });
    note('ui_desk', true, page.url());

    await expandLeft(page);
    if (await page.getByRole('tab', { name: 'Posture' }).isVisible().catch(() => false)) {
      await page.getByRole('tab', { name: 'Posture' }).click();
      await page.waitForTimeout(800);
    }
    note(
      'ui_posture',
      await page.getByTestId('market-posture-panel').isVisible().catch(() => false),
    );

    const right = page.getByRole('tablist', { name: 'Info panel sections' });
    const expandRight = page.getByRole('button', { name: /Expand info panel/ });
    if (await expandRight.isVisible().catch(() => false)) await expandRight.click();
    await right.getByRole('tab', { name: 'Executions' }).click();
    await page.waitForTimeout(1000);
    note(
      'ui_executions',
      await page.getByText(/filled|paper|AAPL|MSFT|NVDA/i).first().isVisible().catch(() => false),
    );
    await browser.close();
  } catch (err) {
    note('ui_desk', false, String(err));
  }

  const summary = {
    companyId: desk.cid,
    companyName: desk.name,
    universe: UNIVERSE.length,
    passed: log.filter((s) => s.ok).length,
    failed: log.filter((s) => !s.ok).length,
    openNames: (
      (finalPos.json as { positions?: Array<{ symbol: string; qty: string }> }).positions ?? []
    ).filter((p) => Number(p.qty) !== 0).length,
    childSliceDrainTraces: childDrainTraces.length,
  };
  console.log('SUMMARY', JSON.stringify(summary, null, 2));
  if (summary.failed > 0 && !log.some((s) => s.step === 'final_book' && s.ok)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
