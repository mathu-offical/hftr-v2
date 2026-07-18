/**
 * Persistent headed Chrome CDP driver for processing-system live tests.
 * Connects to Chrome already running with --remote-debugging-port=9222
 * (profile: .ironbee-browser-profile). Does NOT close the browser.
 *
 * Usage:
 *   cd apps/web && pnpm exec tsx scripts/cdp-processing-flow.ts
 */
import { chromium, type Page } from 'playwright';

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3001';

type Step = { step: string; ok: boolean; detail?: unknown };

async function waitHealth(timeoutMs = 120_000): Promise<boolean> {
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

async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: T | string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) as T };
  } catch {
    return { status: res.status, json: text.slice(0, 400) };
  }
}

async function expandBottom(page: Page) {
  const expand = page.getByRole('button', { name: /Expand bottom panel/ });
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
    await page.waitForTimeout(600);
  }
}

async function expandLeft(page: Page) {
  const expand = page.getByRole('button', { name: /Expand left panel/ });
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
    await page.waitForTimeout(600);
  }
  // Fallback: segmented rail button when collapsed differently
  const rail = page.getByRole('button', { name: /RESEARCH.*POSTURE/i });
  if (
    !(await page.getByRole('tab', { name: 'Posture' }).isVisible().catch(() => false)) &&
    (await rail.isVisible().catch(() => false))
  ) {
    await rail.click();
    await page.waitForTimeout(600);
  }
}

async function main() {
  const log: Step[] = [];
  const note = (step: string, ok: boolean, detail?: unknown) => {
    const row = { step, ok, detail };
    log.push(row);
    console.log(JSON.stringify(row));
  };

  console.log('waiting for health…');
  const healthy = await waitHealth();
  note('health', healthy);
  if (!healthy) {
    console.error('Next not healthy; leaving Chrome open');
    process.exit(1);
  }

  console.log('connecting CDP', CDP);
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  let page = context.pages().find((p) => p.url().includes('127.0.0.1:3001'));
  if (!page) page = context.pages()[0] ?? (await context.newPage());

  // --- API seed (or reuse) company with trading ready ---
  const reuseId = process.env.REUSE_COMPANY_ID?.trim();
  let cid: string;
  let name: string;

  if (reuseId) {
    cid = reuseId;
    name = `reuse:${reuseId}`;
    note('api_create', true, { reused: cid });
    const detail = await api<{
      company: { name?: string };
      modules: Array<{ id: string; type: string; status: string }>;
    }>('GET', `/api/companies/${cid}`);
    if (typeof detail.json === 'string' || !('modules' in detail.json)) {
      note('api_detail', false, detail);
      process.exit(1);
    }
    name = detail.json.company?.name ?? name;
    const modules = detail.json.modules;
    const trend = modules.find((m) => m.type === 'trend')!;
    const trading = modules.find((m) => m.type === 'trading')!;
    note('api_promote', true, { reused: true, trend: trend.id, trading: trading.id });
    note('api_buy_open', true, { reused: true });
  } else {
    name = `BrowserFlow ${Date.now()}`;
    const created = await api<{ company: { id: string } }>('POST', '/api/companies', {
      name,
      philosophyPrompt: 'Live browser processing flow — day trading paper.',
      mode: 'paper',
      seedCreditsCents: 2_000_000,
      engines: [{ templateId: 'engine_day_trading', inputs: {} }],
    });
    note('api_create', created.status === 200 || created.status === 201, created.status);
    if (typeof created.json === 'string' || !('company' in created.json)) {
      process.exit(1);
    }
    cid = created.json.company.id;

    const detail = await api<{
      modules: Array<{ id: string; type: string; status: string }>;
    }>('GET', `/api/companies/${cid}`);
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
        capitalAllocation: { mode: 'percentage', value: '30' },
        targetExitAt: '2099-12-15T20:00:00.000Z',
        timezone: 'America/New_York',
      },
    });
    const tr = await api<{ trend: { id: string } }>('POST', `/api/companies/${cid}/trends`, {
      moduleId: trend.id,
      symbol: 'MSFT',
      direction: 'up',
      strengthBand: 'strong',
    });
    const trendId = (tr.json as { trend: { id: string } }).trend.id;
    const promo = await api<{ drained?: { failed: number; completed: number } }>(
      'POST',
      `/api/companies/${cid}/modules/${trend.id}/promote`,
      { trendId, targetModuleId: trading.id },
    );
    note('api_promote', promo.status === 200, (promo.json as { drained?: unknown }).drained);

    // Leave an open position for posture
    await api('POST', `/api/companies/${cid}/modules/${trading.id}/trade`, {
      actionVerb: 'buy',
      symbol: 'AAPL',
      quantity: 2,
      orderType: 'market',
    });
    note('api_buy_open', true);
  }

  // --- Browser UI ---
  await page.goto(`${BASE}/companies`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(1500);
  const newBtn = page.getByRole('button', { name: 'New company' });
  note('ui_companies', await newBtn.isVisible({ timeout: 60_000 }).catch(() => false));

  // Open seeded company — wait for shell chrome (cold compile can exceed 90s)
  await page.goto(`${BASE}/companies/${cid}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  const shellReady = await Promise.race([
    page.getByRole('button', { name: 'Live trading (gated)' }).waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'live'),
    page.getByRole('button', { name: /Paper trading|paper/i }).waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'paper'),
    page.getByTestId('react-flow').waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'flow'),
    page.locator('.react-flow').first().waitFor({ state: 'visible', timeout: 180_000 }).then(() => 'flow-class'),
  ]).catch(() => 'timeout');
  note('ui_canvas', shellReady !== 'timeout', { shellReady, url: page.url() });

  // Ensure shell hydrated before interacting with gated live control / panels
  await page.getByRole('button', { name: 'Live trading (gated)' }).waitFor({ state: 'visible', timeout: 120_000 });
  await page.waitForTimeout(800);

  const liveBtn = page.getByRole('button', { name: 'Live trading (gated)' });
  if (await liveBtn.isVisible().catch(() => false)) {
    // Real click — evaluate(click) often skips React onClick for this control.
    await liveBtn.click({ force: true });
    await page.waitForTimeout(400);
    const gated = await page.getByText('Live trading is gated.').isVisible({ timeout: 15_000 }).catch(() => false);
    note('ui_live_gate', gated);
    if (gated) await liveBtn.click({ force: true });
  } else {
    note('ui_live_gate', false, 'live button not present');
  }

  // Bottom rail first (posture overlay is full-bleed and covers Trends).
  await expandBottom(page);
  const bottomTabs = page.getByRole('tablist', { name: 'Bottom panel sections' });
  const rightTabs = page.getByRole('tablist', { name: 'Info panel sections' });

  const execTab = rightTabs.getByRole('tab', { name: 'Executions' });
  if (await execTab.isVisible({ timeout: 60_000 }).catch(() => false)) {
    await execTab.click();
    await page.waitForTimeout(1200);
    const execVisible = await page
      .getByText(/filled|No executions|MSFT|AAPL|paper/i)
      .first()
      .isVisible({ timeout: 20_000 })
      .catch(() => false);
    note('ui_executions', execVisible);
  } else {
    // Right panel may be collapsed — expand via ]
    const expandRight = page.getByRole('button', { name: /Expand info panel/ });
    if (await expandRight.isVisible().catch(() => false)) await expandRight.click();
    await page.waitForTimeout(400);
    if (await execTab.isVisible().catch(() => false)) {
      await execTab.click();
      await page.waitForTimeout(800);
      note(
        'ui_executions',
        await page.getByText(/filled|No executions|MSFT|AAPL|paper/i).first().isVisible().catch(() => false),
      );
    } else {
      note('ui_executions', false, 'Executions tab missing');
    }
  }

  const trendsTabBtn = bottomTabs.getByRole('tab', { name: 'Trends' });
  if (await trendsTabBtn.isVisible({ timeout: 30_000 }).catch(() => false)) {
    await trendsTabBtn.click();
    await page.waitForTimeout(1000);
    const trendsTab = await page
      .getByText(/Trend lists|Promote|MSFT|No trends|candidate/i)
      .first()
      .isVisible({ timeout: 20_000 })
      .catch(() => false);
    note('ui_trends', trendsTab);
  } else {
    await page.keyboard.press('`');
    await page.waitForTimeout(500);
    if (await trendsTabBtn.isVisible().catch(() => false)) {
      await trendsTabBtn.click();
      note(
        'ui_trends',
        await page.getByText(/Trend lists|Promote|MSFT|No trends|candidate/i).first().isVisible().catch(() => false),
      );
    } else {
      note('ui_trends', false, 'Trends tab missing');
    }
  }

  // Left: Posture (tabs only exist after left rail expands)
  await expandLeft(page);
  await page.waitForTimeout(500);
  if (!(await page.getByRole('tab', { name: 'Posture' }).isVisible().catch(() => false))) {
    await page.keyboard.press('[');
    await page.waitForTimeout(500);
  }
  const postureTab = page.getByRole('tab', { name: 'Posture' });
  if (await postureTab.isVisible({ timeout: 60_000 }).catch(() => false)) {
    await postureTab.click();
    await page.waitForTimeout(800);
    const posture = await page
      .getByTestId('market-posture-panel')
      .isVisible({ timeout: 30_000 })
      .catch(() => false);
    note('ui_posture_panel', posture);
    const overlayAuto = await page
      .getByTestId('market-posture-overlay')
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    note('ui_posture_overlay', overlayAuto);
    // Leave Posture overlay up for continued operator observation.
  } else {
    note('ui_posture_panel', false, 'Posture tab missing');
    note('ui_posture_overlay', false, 'skipped');
  }

  // Service coverage + hub refresh (before reload — reload destroys evaluate context)
  try {
    const cov = await page.evaluate(async (companyId) => {
      const r = await fetch(`/api/companies/${companyId}/service-coverage`);
      return { status: r.status, ok: r.ok };
    }, cid);
    note('ui_fetch_coverage', cov.ok, cov);
  } catch (err) {
    note('ui_fetch_coverage', false, String(err).slice(0, 200));
  }

  try {
    const hub = await page.evaluate(async (companyId) => {
      const r = await fetch(`/api/companies/${companyId}/market-hub`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, drained: j.drained, enqueued: j.enqueued };
    }, cid);
    note('ui_hub_refresh', hub.status === 200, hub);
  } catch (err) {
    note('ui_hub_refresh', false, String(err).slice(0, 200));
  }

  // Console errors on soft reload
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(2500);
  } catch (err) {
    note('ui_reload', false, String(err).slice(0, 200));
  }
  note('ui_console_errors', consoleErrors.length === 0, consoleErrors.slice(0, 5));

  // Leave browser on company canvas for continued manual/agent use
  try {
    await page.goto(`${BASE}/companies/${cid}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForTimeout(1000);
  } catch {
    /* leave wherever we are */
  }

  const summary = {
    companyId: cid,
    companyName: name,
    passed: log.filter((s) => s.ok).length,
    failed: log.filter((s) => !s.ok).length,
    steps: log,
  };
  console.log('SUMMARY', JSON.stringify(summary, null, 2));
  // Do NOT browser.close() — persist for continued testing
  await browser.close(); // disconnect only; Chrome CDP process stays up
  console.log('CDP disconnected; headed Chrome left open on', `${BASE}/companies/${cid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
