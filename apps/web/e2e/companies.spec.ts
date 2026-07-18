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
  await page.getByRole('button', { name: /Quick add · Day trading/ }).click();
  await expect(page.getByTestId('engine-seed-card').first()).toBeVisible({
    timeout: CREATE_FORM_TIMEOUT_MS,
  });
  const skip = page.getByRole('button', { name: 'Skip setup & open canvas' });
  await expect(skip).toBeEnabled({ timeout: CREATE_FORM_TIMEOUT_MS });
  await skip.click();
  await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/, {
    timeout: CREATE_FORM_TIMEOUT_MS,
  });
}

test.describe('Companies directory', () => {
  test('exposes User Settings from the directory shell', async ({ page }) => {
    await page.goto('/companies');
    await expect(page.getByText(/llm:\s*\d+\/6/i)).toBeVisible();
    await page.getByRole('button', { name: 'Open user settings' }).click();
    await expect(page.getByRole('dialog', { name: 'User settings' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'LLM providers' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Research' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Brokers' })).toBeVisible();
    await page.getByRole('tab', { name: 'Research' }).click();
    await expect(page.getByText('Research gather keys')).toBeVisible();
    await page.getByRole('button', { name: 'Close settings' }).click();
  });

  test('engine-centric create: quick-add, remove, ≥1 gate, and inline definition', async ({
    page,
  }) => {
    await openNewCompanyForm(page);
    await expect(page.getByRole('heading', { name: 'Engines' })).toBeVisible();
    await expect(page.getByTestId('engines-empty-hint')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create (paper mode)' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Skip setup & open canvas' })).toBeDisabled();

    await expect(page.getByRole('button', { name: /Quick add · Day trading/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Quick add · Trend research/ })).toBeVisible();

    await page.getByRole('button', { name: /Quick add · Day trading/ }).click();
    const engineCard = page.getByTestId('engine-seed-card').first();
    await expect(engineCard).toBeVisible();
    // Topic stays operator-required; capital/exit are prefilled defaults (D-035).
    await expect(page.getByText(/Required · Topic \/ sector/).first()).toBeVisible();
    await expect(page.getByLabel('Confirmed: Capital allocation').first()).toBeVisible();

    const allocationMode = page.getByLabel('Capital allocation mode').first();
    const allocationValue = page.getByLabel('Capital allocation value').first();
    await expect(allocationMode).toBeVisible();
    await expect(allocationValue).toBeVisible();
    // Full seed envelope on the engine card (cascade splits on create).
    await expect(allocationValue).toHaveValue('10000.00');
    const modeBox = await allocationMode.boundingBox();
    const valueBox = await allocationValue.boundingBox();
    expect(modeBox).toBeTruthy();
    expect(valueBox).toBeTruthy();
    expect(valueBox!.width).toBeGreaterThan(80);
    expect(modeBox!.width).toBeLessThan(valueBox!.width);
    await allocationValue.fill('2500.00');
    await expect(allocationValue).toHaveValue('2500.00');

    await page.getByRole('button', { name: /Quick add · Trend research/ }).click();
    await expect(page.getByTestId('engine-seed-card')).toHaveCount(2);
    await page
      .getByTestId('engine-seed-card')
      .nth(1)
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(page.getByTestId('engine-seed-card')).toHaveCount(1);

    await page.getByLabel('Add module').selectOption('research');
    await expect(page.getByTestId('extra-seed-module')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Skip setup & open canvas' })).toBeEnabled();

    // Removing the last engine re-blocks create.
    await page.getByTestId('engine-seed-card').getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('engines-empty-hint')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create (paper mode)' })).toBeDisabled();
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
      modules: Array<{
        id: string;
        type: string;
        config: Record<string, unknown>;
        toolOwnerModuleId: string | null;
      }>;
    };
    const requiredOwners = source.modules.filter((module) =>
      ['research', 'trend', 'trading', 'analyzer', 'simulator', 'generator'].includes(module.type),
    );
    const ownedMath = source.modules.filter(
      (module) => module.type === 'math' && module.toolOwnerModuleId,
    );
    expect(ownedMath).toHaveLength(requiredOwners.length);
    for (const owner of requiredOwners) {
      expect(ownedMath.some((math) => math.toolOwnerModuleId === owner.id)).toBe(true);
    }
    await expect(
      page.getByRole('group', { name: 'Dedicated Math tool for Market Regime Research' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('group', { name: 'Dedicated Math tool for Market Regime Research' }),
    ).toBeVisible();
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
        id: string;
        type: string;
        status: string;
        allocationCents: string;
        capitalAllocationRef: string | null;
        targetExitRef: string | null;
        toolOwnerModuleId: string | null;
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
    const duplicateIds = new Set(duplicate.modules.map((module) => module.id));
    for (const math of duplicate.modules.filter((module) => module.toolOwnerModuleId)) {
      expect(math.type).toBe('math');
      expect(duplicateIds.has(math.toolOwnerModuleId!)).toBe(true);
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
