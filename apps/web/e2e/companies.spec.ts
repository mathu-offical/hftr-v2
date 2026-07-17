import type { Page } from '@playwright/test';
import { test, expect, e2eCompanyName, archiveCompany } from './fixtures';

const CREATE_FORM_TIMEOUT_MS = 60_000;

async function openNewCompanyForm(page: Page): Promise<void> {
  await page.goto('/companies');
  await page.getByRole('button', { name: 'New company' }).click();
  await expect(page.getByRole('heading', { name: 'New company' })).toBeVisible({
    timeout: CREATE_FORM_TIMEOUT_MS,
  });
}

async function createDayTradingCompany(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Day trading starter/ }).click();
  const skip = page.getByRole('button', { name: 'Skip setup & open canvas' });
  await expect(skip).toBeVisible({ timeout: CREATE_FORM_TIMEOUT_MS });
  await skip.click();
  await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/, {
    timeout: CREATE_FORM_TIMEOUT_MS,
  });
}

test.describe('Companies directory', () => {
  test('loads and exposes template choices in the create form', async ({ page }) => {
    await openNewCompanyForm(page);
    await expect(page.getByText('Start from')).toBeVisible();

    await expect(page.getByRole('button', { name: /Blank/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Day trading starter/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Trend research lab/ })).toBeVisible();

    await page.getByRole('button', { name: /Day trading starter/ }).click();
    await expect(page.getByRole('heading', { name: 'Template setup' })).toBeVisible();
    await expect(page.getByTestId('template-module-setup-0')).toBeVisible();
    await expect(page.getByText(/Required · Capital allocation/).first()).toBeVisible();
    await expect(page.getByText(/Required · Topic \/ sector/).first()).toBeVisible();
    await expect(page.getByText(/Required · Target exit/).first()).toBeVisible();

    const allocationMode = page.getByLabel('Capital allocation mode').first();
    const allocationValue = page.getByLabel('Capital allocation value').first();
    await expect(allocationMode).toBeVisible();
    await expect(allocationValue).toBeVisible();
    const modeBox = await allocationMode.boundingBox();
    const valueBox = await allocationValue.boundingBox();
    expect(modeBox).toBeTruthy();
    expect(valueBox).toBeTruthy();
    expect(valueBox!.width).toBeGreaterThan(80);
    expect(modeBox!.width).toBeLessThan(valueBox!.width);
    await allocationValue.fill('2500.00');
    await expect(allocationValue).toHaveValue('2500.00');

    await page.getByLabel('Add module').selectOption('research');
    await expect(page.getByTestId('extra-seed-module')).toBeVisible();
    await page.getByLabel('Add engine').selectOption('engine_trend_research');
    await expect(page.getByTestId('extra-seed-engine')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Skip setup & open canvas' })).toBeVisible();
  });

  test('company card shows mode, engines, and supports navigate / rename / duplicate / delete', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const name = e2eCompanyName('card');
    await openNewCompanyForm(page);
    await page.getByPlaceholder('e.g. Momentum Desk').fill(name);
    await page.getByPlaceholder(/Patient swing trading/).fill('Card actions e2e philosophy.');
    await createDayTradingCompany(page);
    const companyUrl = page.url();
    const companyId = companyUrl.split('/').pop()!;
    createdCompanyIds.push(companyId);

    // Seed a company-bound library id into research config. Duplication must
    // scrub it rather than letting the copy write back into the source library.
    const sourceResponse = await request.get(`/api/companies/${companyId}`);
    expect(sourceResponse.ok()).toBeTruthy();
    const source = (await sourceResponse.json()) as {
      modules: Array<{ id: string; type: string; config: Record<string, unknown> }>;
    };
    const researchModule = source.modules.find((module) => module.type === 'research');
    expect(researchModule).toBeDefined();
    const libraryResponse = await request.post(`/api/companies/${companyId}/libraries`, {
      data: {
        name: `E2E duplicate boundary ${Date.now()}`,
        topicScope: 'duplication boundary',
        masterLibrary: false,
        moduleId: researchModule!.id,
      },
    });
    expect(libraryResponse.ok()).toBeTruthy();
    const { library } = (await libraryResponse.json()) as { library: { id: string } };
    const researchPatch = await request.patch(
      `/api/companies/${companyId}/modules/${researchModule!.id}`,
      {
        data: {
          config: {
            ...researchModule!.config,
            targetLibraryIds: [library.id],
          },
        },
      },
    );
    expect(researchPatch.ok()).toBeTruthy();

    await page.goto('/companies');
    const card = page.locator('[data-testid="company-card"]').filter({ hasText: name });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-mode', 'paper');
    await expect(card.getByText('paper', { exact: true })).toBeVisible();
    await expect(card.getByText(/Engines ·/)).toBeVisible();
    await expect(card.getByText(/Day trading/i)).toBeVisible();

    await card.getByRole('link', { name: `Open ${name}` }).click();
    await page.waitForURL(new RegExp(`/companies/${companyId}$`));

    await page.goto('/companies');
    const cardAgain = page.locator('[data-testid="company-card"]').filter({ hasText: name });
    await cardAgain.getByRole('button', { name: `Company options for ${name}` }).click();
    await expect(cardAgain.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    await cardAgain.getByRole('menuitem', { name: 'Rename' }).click({ force: true });
    // Rename mode replaces the card body, so its old-name text filter no longer matches.
    const renameInput = page.getByRole('textbox', { name: 'Company name' });
    await expect(renameInput).toBeVisible({ timeout: 10_000 });
    const renamed = `${name} Renamed`.slice(0, 80);
    await renameInput.fill(renamed);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.locator('[data-testid="company-card"]').filter({ hasText: renamed }),
    ).toBeVisible();

    const renamedCard = page.locator('[data-testid="company-card"]').filter({ hasText: renamed });
    await renamedCard.getByRole('button', { name: `Company options for ${renamed}` }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    const copyCard = page
      .locator('[data-testid="company-card"]')
      .filter({ hasText: `${renamed} (copy)` });
    await expect(copyCard).toBeVisible({ timeout: 30_000 });
    const duplicateId = await copyCard.getAttribute('data-company-id');
    expect(duplicateId).toMatch(/^[0-9a-f-]{36}$/);
    expect(duplicateId).not.toBe(companyId);
    createdCompanyIds.push(duplicateId!);

    const duplicateResponse = await request.get(`/api/companies/${duplicateId!}`);
    expect(duplicateResponse.ok()).toBeTruthy();
    const duplicate = (await duplicateResponse.json()) as {
      company: {
        mode: string;
        seedCreditsCents: string;
        brokerConnectionId: string | null;
        liveArmedAt: string | null;
        liveGateEvidenceId: string | null;
      };
      modules: Array<{
        type: string;
        status: string;
        allocationCents: string;
        capitalAllocationRef: string | null;
        targetExitRef: string | null;
        config: Record<string, unknown>;
      }>;
    };
    expect(duplicate.company).toMatchObject({
      mode: 'paper',
      seedCreditsCents: '0',
      brokerConnectionId: null,
      liveArmedAt: null,
      liveGateEvidenceId: null,
    });
    expect(duplicate.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'math', status: 'active' }),
        expect.objectContaining({ type: 'trading', status: 'draft' }),
      ]),
    );
    for (const module of duplicate.modules) {
      expect(module.allocationCents).toBe('0');
      expect(module.capitalAllocationRef).toBeNull();
      expect(module.targetExitRef).toBeNull();
    }
    expect(
      duplicate.modules.find((module) => module.type === 'research')?.config.targetLibraryIds,
    ).toEqual([]);

    await expect(copyCard).toHaveAttribute('data-mode', 'paper');

    page.once('dialog', (dialog) => dialog.accept());
    await copyCard.getByRole('button', { name: /Company options for/ }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(
      page.locator('[data-testid="company-card"]').filter({ hasText: `${renamed} (copy)` }),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="company-card"]').filter({ hasText: renamed }),
    ).toBeVisible();

    // Archived company is gone from scoped APIs (ISO-005 / fail-closed archive).
    const afterArchive = await request.get(`/api/companies/${duplicateId}`);
    expect(afterArchive.status()).toBe(404);
    const renameArchived = await request.patch(`/api/companies/${duplicateId}`, {
      data: { name: `${renamed} (ghost)` },
    });
    expect(renameArchived.status()).toBe(404);
    const duplicateArchived = await request.post(`/api/companies/${duplicateId}/duplicate`);
    expect(duplicateArchived.status()).toBe(404);

    await archiveCompany(request, duplicateId!).catch(() => undefined);
  });
});
