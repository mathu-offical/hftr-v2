/**
 * Operator-visible scenarios with immediate UI feedback.
 * Run: pnpm exec playwright test --config=playwright.watch.config.ts
 */
import { expect, test, createCompanyApiBody, e2eCompanyName, openNewCompanyForm } from './fixtures';

test.describe('Live demo batch 2 (watch)', () => {
  test.setTimeout(180_000);

  test('create form: add day-trading engine and see research deps', async ({ page }) => {
    await openNewCompanyForm(page);
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: 'Open execution store' }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Add Day trading engine' }).click();
    await expect(page.getByTestId('engine-seed-card').first()).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1500);

    // Immediate: research dependency packs appear
    await expect(page.getByText(/research|regime|librarian|library/i).first()).toBeVisible();
    await page.waitForTimeout(1200);

    // Cancel — do not create (keep run fast / avoid limit)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  });

  test('canvas: modules store, live-gate panel, posture refresh', async ({
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

    await page.goto(`/companies/${company.id}`);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);

    // Modules store opens immediately
    await page.getByRole('button', { name: 'Open modules store' }).click();
    await page.waitForTimeout(1200);
    await expect(page.getByText(/module|engine|trading|research/i).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // Live gate popover — fail-closed copy is immediate
    await page.getByRole('button', { name: 'Live trading (gated)' }).click();
    await expect(page.getByText(/Live trading is gated/i)).toBeVisible();
    await page.waitForTimeout(1500);
    const arm = page.getByRole('button', { name: 'Arm', exact: true });
    if (await arm.isVisible()) {
      await arm.click();
      await page.waitForTimeout(1200);
      await expect(page.getByText(/Arm blocked|gated|checklist|Could not arm/i).first()).toBeVisible({
        timeout: 10_000,
      });
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Left panel posture
    const expandLeft = page.getByRole('button', { name: /Expand left panel/ });
    if (await expandLeft.isVisible()) await expandLeft.click();
    await page.getByRole('tab', { name: 'Posture' }).click();
    await expect(page.getByTestId('market-posture-panel')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    const refresh = page.getByRole('button', { name: /Refresh/i }).first();
    if (await refresh.isVisible()) {
      await refresh.click();
      await page.waitForTimeout(2000);
    }

    // Research shelves
    await page.getByRole('tab', { name: 'Research' }).click();
    await page.waitForTimeout(1200);
    await expect(
      page.getByText(/System curated|Seeded trading mechanisms|Libraries/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2000);
  });

  test('directory: company card actions visible after create', async ({
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
    await expect(page.getByText(name)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1000);

    const card = page.getByTestId('company-card').filter({ hasText: name });
    await expect(card).toBeVisible();
    await page.waitForTimeout(800);

    // Open card menu
    await card.getByRole('button', { name: new RegExp(`Company options for`) }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    await card.getByRole('link', { name: new RegExp(`Open ${name}`) }).click();
    await page.waitForURL(new RegExp(`/companies/${company.id}`), { timeout: 60_000 });
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
  });
});
