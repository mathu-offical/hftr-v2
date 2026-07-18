/**
 * Headed visual walkthroughs — prefer pre-create + immediate UI clicks.
 */
import { expect, test, createCompanyApiBody, e2eCompanyName, openNewCompanyForm } from './fixtures';

test.describe('Live demo (watch)', () => {
  test.setTimeout(240_000);

  test('create form: add day-trading engine and see research deps', async ({ page }) => {
    await openNewCompanyForm(page);
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Open execution store' }).click();
    await page.getByRole('button', { name: 'Add Day trading engine' }).click();
    await expect(page.getByTestId('engine-seed-card').first()).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
  });

  test('settings: LLM / Research / Brokers tabs', async ({ page }) => {
    await page.goto('/companies', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'New company' })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Open user settings' }).click();
    await expect(page.getByRole('dialog', { name: 'User settings' })).toBeVisible();
    await page.waitForTimeout(800);

    await expect(page.getByText('Anthropic (Claude)')).toBeVisible();
    await page.getByRole('tab', { name: 'Research' }).click();
    await expect(page.getByText('Brave Search')).toBeVisible();
    await page.waitForTimeout(700);

    await page.getByRole('tab', { name: 'Brokers' }).click();
    await expect(page.getByRole('heading', { name: 'Alpaca paper' })).toBeVisible();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Close settings' }).click();
  });

  test('canvas: gate popover + posture + research', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const name = e2eCompanyName('watch-canvas');
    const create = await request.post('/api/companies', {
      data: createCompanyApiBody(name, {
        philosophyPrompt: 'Watch demo — canvas and gates.',
      }),
      timeout: 180_000,
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const { company } = (await create.json()) as { company: { id: string } };
    createdCompanyIds.push(company.id);

    await request.get(`/api/companies/${company.id}`);
    await request.get(`/api/companies/${company.id}/canvas`);
    await request.get(`/api/companies/${company.id}/live-gates/status`);

    await page.goto(`/companies/${company.id}`, { waitUntil: 'domcontentloaded' });
    const liveBtn = page.getByRole('button', { name: 'Live trading (gated)' });
    await expect(liveBtn).toBeVisible({ timeout: 90_000 });
    // Let bootstrap queue/canvas settle so shell remounts don't eat the popover.
    await page.waitForTimeout(2500);

    // Native click once — Playwright+slowMo can double-toggle this control closed.
    await liveBtn.evaluate((el) => (el as HTMLButtonElement).click());
    await expect(liveBtn).toHaveAttribute('aria-expanded', 'true', { timeout: 10_000 });
    await expect(page.getByText('Live trading is gated.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Paper and live share the same engine/i)).toBeVisible();
    await page.waitForTimeout(1500);
    await liveBtn.evaluate((el) => (el as HTMLButtonElement).click());
    await expect(liveBtn).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(400);

    await page.getByRole('button', { name: 'Open modules store' }).click();
    await expect(page.getByText(/Modules|Add /i).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    const expandLeft = page.getByRole('button', { name: /Expand left panel/ });
    if (await expandLeft.isVisible()) await expandLeft.click();
    await page.getByRole('tab', { name: 'Posture' }).click();
    await expect(page.getByTestId('market-posture-panel')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1000);

    await page.getByRole('tab', { name: 'Research' }).click();
    await expect(
      page.getByText(/System curated|Seeded trading mechanisms|Libraries/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);

    // Bottom strip + assistant — instant chrome
    await page.getByRole('button', { name: /Expand bottom panel/ }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Open read-only assistant' }).click();
    await expect(page.getByText(/Assistant|read-only|proposals/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(1200);
  });

  test('directory: company card menu then open canvas', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const name = e2eCompanyName('watch-card');
    const create = await request.post('/api/companies', {
      data: createCompanyApiBody(name, {
        philosophyPrompt: 'Watch demo — directory card.',
      }),
      timeout: 180_000,
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const { company } = (await create.json()) as { company: { id: string } };
    createdCompanyIds.push(company.id);

    await page.goto('/companies');
    const card = page.getByTestId('company-card').filter({ hasText: name });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);

    await card.getByRole('button', { name: /Company options for/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');

    await card.getByRole('link', { name: new RegExp(`Open ${name}`) }).click();
    await expect(page.getByRole('button', { name: 'Live trading (gated)' })).toBeVisible({
      timeout: 90_000,
    });
    await page.waitForTimeout(1200);
  });
});
