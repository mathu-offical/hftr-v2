/**
 * UI continuation for Desk 184011 — resilient trader walk.
 */
import { chromium, type Page } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3001';
const CID = process.env.REUSE_COMPANY_ID ?? '92176d97-3d14-4d35-b7fc-1d1bba03a6da';
const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';

function note(step: string, ok: boolean, detail?: unknown) {
  console.log(JSON.stringify({ step, ok, detail }));
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180_000),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function safeClick(page: Page, name: RegExp | string, label: string) {
  const loc =
    typeof name === 'string'
      ? page.getByRole('button', { name })
      : page.getByRole('button', { name });
  if (await loc.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await loc.first().click({ force: true });
    note(label, true);
    return true;
  }
  note(label, false, 'not visible');
  return false;
}

async function main() {
  const detail = await api('GET', `/api/companies/${CID}`);
  const trading = (detail.json as { modules: Array<{ id: string; type: string }> }).modules.find(
    (m) => m.type === 'trading',
  )!;
  note('desk', true, {
    name: (detail.json as { company: { name: string } }).company.name,
    trading: trading.id,
  });

  // Book before UI
  const before = {
    positions: await api('GET', `/api/companies/${CID}/positions`),
    executions: await api('GET', `/api/companies/${CID}/executions`),
    activity: await api('GET', `/api/companies/${CID}/activity`),
  };
  note('book_before', true, {
    positions: (
      (before.positions.json as { positions?: Array<{ symbol: string; qty: string }> }).positions ?? []
    ).map((p) => `${p.symbol}:${p.qty}`),
    executions: (before.executions.json as { executions?: unknown[] }).executions?.length,
    balanceCents: (before.activity.json as { balanceCents?: string }).balanceCents,
  });

  // Trim if long AAPL
  const aapl = (
    (before.positions.json as { positions?: Array<{ symbol: string; qty: string }> }).positions ?? []
  ).find((p) => p.symbol === 'AAPL' && Number(p.qty) > 0);
  if (aapl) {
    const sell = await api('POST', `/api/companies/${CID}/modules/${trading.id}/trade`, {
      actionVerb: 'sell',
      symbol: 'AAPL',
      quantity: 1,
      orderType: 'market',
    });
    note('trim_aapl', sell.status === 200, sell.json);
  } else {
    note('trim_aapl', true, 'flat');
  }

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0] ?? (await browser.newContext());
  let page = ctx.pages().find((p) => p.url().includes('3001'));
  if (!page) page = ctx.pages()[0] ?? (await ctx.newPage());

  await page.goto(`${BASE}/companies/${CID}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForTimeout(2500);
  const liveVisible = await page
    .getByRole('button', { name: 'Live trading (gated)' })
    .isVisible({ timeout: 90_000 })
    .catch(() => false);
  note('ui_open', liveVisible, page.url());

  if (liveVisible) {
    await page.getByRole('button', { name: 'Live trading (gated)' }).click({ force: true });
    await page.waitForTimeout(600);
    note(
      'ui_live_gated',
      await page.getByText('Live trading is gated.').isVisible().catch(() => false),
    );
    await page.getByRole('button', { name: 'Live trading (gated)' }).click({ force: true });
  }

  // Expand rails via shortcuts traders would learn
  await page.keyboard.press('`'); // bottom
  await page.waitForTimeout(400);
  await page.keyboard.press(']'); // right
  await page.waitForTimeout(400);
  await page.keyboard.press('['); // left
  await page.waitForTimeout(400);

  // Trends (bottom)
  const bottomTrends = page
    .getByRole('tablist', { name: 'Bottom panel sections' })
    .getByRole('tab', { name: 'Trends' });
  if (await bottomTrends.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await bottomTrends.click();
    await page.waitForTimeout(1000);
    note(
      'ui_trends',
      await page.getByText(/MSFT|Trend|Promote|candidate/i).first().isVisible().catch(() => false),
    );
  } else {
    note('ui_trends', false, 'bottom Trends missing after `');
  }

  // Executions (right)
  const execTab = page
    .getByRole('tablist', { name: 'Info panel sections' })
    .getByRole('tab', { name: 'Executions' });
  if (await execTab.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await execTab.click();
    await page.waitForTimeout(1200);
    note(
      'ui_fills',
      await page.getByText(/filled|NVDA|AAPL|paper/i).first().isVisible().catch(() => false),
    );
  } else {
    note('ui_fills', false, 'Executions tab missing');
  }

  // Posture
  const posture = page.getByRole('tab', { name: 'Posture' });
  if (await posture.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await posture.click();
    await page.waitForTimeout(1000);
    note(
      'ui_posture',
      await page.getByTestId('market-posture-panel').isVisible().catch(() => false),
    );
    note(
      'ui_posture_overlay',
      await page.getByTestId('market-posture-overlay').isVisible().catch(() => false),
    );
  } else {
    note('ui_posture', false);
  }

  const hub = await page.evaluate(async (cid) => {
    const r = await fetch(`/api/companies/${cid}/market-hub`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, drained: j.drained, enqueued: j.enqueued };
  }, CID);
  note('ui_hub_refresh', hub.status === 200, hub);

  const after = {
    positions: await api('GET', `/api/companies/${CID}/positions`),
    executions: await api('GET', `/api/companies/${CID}/executions`),
    activity: await api('GET', `/api/companies/${CID}/activity`),
  };
  note('final_book', true, {
    positions: (
      (after.positions.json as { positions?: Array<{ symbol: string; qty: string }> }).positions ?? []
    ).map((p) => `${p.symbol}:${p.qty}`),
    executions: (after.executions.json as { executions?: unknown[] }).executions?.length,
    balanceCents: (after.activity.json as { balanceCents?: string }).balanceCents,
  });

  // Leave on posture for human watch
  if (await posture.isVisible().catch(() => false)) await posture.click();
  await browser.close();
  note('done', true, `${BASE}/companies/${CID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
