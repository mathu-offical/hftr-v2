/**
 * Inspect current canvas ARIA + dump tabs for CDP debugging.
 * Leaves Chrome open.
 */
import { chromium } from 'playwright';

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const CID = process.env.REUSE_COMPANY_ID ?? '302bc3d3-5110-4cd2-bb05-93c79134bfef';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3001';

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${BASE}/companies/${CID}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForTimeout(3000);

  const live = page.getByRole('button', { name: 'Live trading (gated)' });
  console.log('live_visible', await live.isVisible().catch(() => false));
  if (await live.isVisible().catch(() => false)) {
    await live.click({ force: true });
    await page.waitForTimeout(500);
    console.log('gated_text', await page.getByText('Live trading is gated.').isVisible().catch(() => false));
    const popover = await page.locator('[role="dialog"], [data-state="open"], .popover, [class*="popover"]').count();
    console.log('popoverish_count', popover);
    console.log('body_snip', (await page.locator('body').innerText()).slice(0, 1200));
  }

  const tabs = await page.getByRole('tab').allTextContents();
  console.log('tabs', tabs);

  const buttons = await page.getByRole('button').allTextContents();
  console.log(
    'buttons_sample',
    buttons.map((b) => b.trim()).filter(Boolean).slice(0, 40),
  );

  // expand panels
  for (const name of ['Expand left panel', 'Expand bottom panel', 'Expand right panel']) {
    const b = page.getByRole('button', { name });
    if (await b.isVisible().catch(() => false)) {
      await b.click();
      console.log('clicked', name);
      await page.waitForTimeout(400);
    }
  }
  console.log('tabs_after_expand', await page.getByRole('tab').allTextContents());
  console.log('url', page.url());

  // API checks from page
  const api = await page.evaluate(async (companyId) => {
    const cov = await fetch(`/api/companies/${companyId}/service-coverage`);
    const hub = await fetch(`/api/companies/${companyId}/market-hub`, { method: 'POST' });
    const exec = await fetch(`/api/companies/${companyId}/executions`);
    const hubJ = await hub.json().catch(() => ({}));
    const execJ = await exec.json().catch(() => ({}));
    return {
      coverage: cov.status,
      hub: hub.status,
      hubDrained: hubJ.drained,
      executions: exec.status,
      execCount: Array.isArray(execJ.executions)
        ? execJ.executions.length
        : Array.isArray(execJ)
          ? execJ.length
          : Object.keys(execJ).slice(0, 5),
    };
  }, CID);
  console.log('api', JSON.stringify(api));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
