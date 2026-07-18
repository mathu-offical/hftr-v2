import { e2eCompanyName, expect, test } from './fixtures';

test.describe('Canvas ENGINE groups (D-028)', () => {
  test('shows engine chrome, cascades master topic, and offers delete modes', async ({
    page,
    createdCompanyIds,
  }) => {
    test.setTimeout(120_000);

    await page.goto('/companies');
    await page.getByRole('button', { name: 'New company' }).click();
    await page.getByLabel('Name', { exact: true }).fill(e2eCompanyName('engine-groups'));
    await page
      .getByLabel(/Philosophy/)
      .fill('E2E paper desk for ENGINE group visualization verification.');
    await page.getByRole('button', { name: /Quick add · Day trading/ }).click();
    await page.getByRole('button', { name: 'Skip setup & open canvas' }).click();

    await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/);
    const companyId = page.url().split('/').pop()!;
    createdCompanyIds.push(companyId);

    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible();

    const engineGroup = canvas.locator('.react-flow__node-engineGroup').first();
    await expect(engineGroup).toBeVisible();
    await expect(engineGroup.getByText('Engine', { exact: true })).toBeVisible();
    await expect(engineGroup.getByText(/Day trading/i)).toBeVisible();

    const masterTopic = engineGroup.getByPlaceholder(/semiconductors/i);
    await expect(masterTopic).toBeVisible();
    await masterTopic.fill('semiconductors');
    const saveMaster = engineGroup.getByRole('button', { name: 'Save', exact: true });
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/engines/') && res.request().method() === 'PATCH' && res.ok(),
      ),
      saveMaster.click(),
    ]);

    const researchNode = canvas
      .locator('.react-flow__node-module')
      .filter({ has: page.getByText('Research', { exact: true }) })
      .first();
    await expect(researchNode).toBeVisible({ timeout: 15_000 });
    await expect(researchNode.getByLabel('Topic / sector', { exact: true })).toHaveValue(
      /semiconductors/i,
      { timeout: 15_000 },
    );

    await researchNode.getByLabel('Topic / sector', { exact: true }).fill('override-topic');
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/modules/') && res.request().method() === 'PATCH' && res.ok(),
      ),
      researchNode.getByRole('button', { name: 'Save setup' }).click(),
    ]);
    await expect(researchNode.getByRole('button', { name: 'Use engine topic' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /Open engines store/i }).click();
    await page.getByRole('button', { name: 'Engines', exact: true }).click();
    await page.getByRole('button', { name: /Trend research engine/i }).click();
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(canvas.locator('.react-flow__node-engineGroup')).toHaveCount(2, {
      timeout: 30_000,
    });

    await canvas
      .locator('.react-flow__node-engineGroup')
      .filter({ hasText: /Day trading/i })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Delete engine group?' })).toBeVisible();
    await page.getByRole('button', { name: 'Ungroup only' }).click();
    await expect(
      canvas
        .locator('.react-flow__node-module')
        .filter({ has: page.getByText('Trading', { exact: true }) })
        .first(),
    ).toBeVisible();
  });
});
