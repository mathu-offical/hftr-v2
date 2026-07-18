import { archiveCompany, e2eCompanyName, expect, test } from './fixtures';

test.describe('Canvas node dashboard (D-026)', () => {
  test('keeps trading setup fixed and restores generated names', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    test.setTimeout(90_000);

    await page.goto('/companies');
    await page.getByRole('button', { name: 'New company' }).click();
    await page.getByLabel('Name', { exact: true }).fill(e2eCompanyName('canvas-dashboard'));
    await page
      .getByLabel(/Philosophy/)
      .fill('E2E paper desk for focused canvas dashboard verification.');
    await page.getByRole('button', { name: /Quick add · Day trading/ }).click();
    await page.getByRole('button', { name: 'Skip setup & open canvas' }).click();

    await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/);
    const companyId = page.url().split('/').pop()!;
    createdCompanyIds.push(companyId);

    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible();

    const tradingNode = canvas
      .locator('.react-flow__node')
      .filter({ has: page.getByText('Trading', { exact: true }) });
    await expect(tradingNode).toBeVisible();
    await expect(tradingNode).toContainText('Paper Day-Trade Execution');

    const collapseInfoPanel = page.getByRole('button', { name: /Collapse info panel/ });
    if (await collapseInfoPanel.isVisible()) {
      await collapseInfoPanel.click();
      await expect(page.getByRole('button', { name: /Expand info panel/ })).toBeVisible();
    }

    await expect(tradingNode.getByText('Required · Topic / sector', { exact: true })).toBeVisible();
    await expect(
      tradingNode.getByText('Required · Capital allocation', { exact: true }),
    ).toBeVisible();
    await expect(tradingNode.getByText('Required · Target exit', { exact: true })).toBeVisible();

    const topicField = tradingNode.getByLabel('Topic / sector', { exact: true });
    const allocationField = tradingNode.getByLabel('Capital allocation value', { exact: true });
    const targetExitField = tradingNode.getByLabel('Target exit date / time', { exact: true });
    await expect(topicField).toBeVisible();
    await expect(topicField).toBeEditable();
    await expect(allocationField).toBeVisible();
    await expect(allocationField).toBeEditable();
    await expect(targetExitField).toBeVisible();
    await expect(targetExitField).toBeEditable();

    for (const handleLabel of [
      'Data feed input',
      'Directive input',
      'Fund route input',
      'Data feed output',
      'Directive output',
      'Verification output',
      'Fund route output',
    ] as const) {
      await expect(tradingNode.getByLabel(handleLabel, { exact: true })).toBeAttached();
    }

    await topicField.click();
    await expect(page.getByRole('button', { name: 'Close inspector' })).not.toBeVisible();

    const nodeBoxBeforeSelect = await tradingNode.boundingBox();
    expect(nodeBoxBeforeSelect).not.toBeNull();
    await tradingNode.getByText('Trading', { exact: true }).click();
    await expect(page.getByText(/Generated from connections/)).toBeVisible();
    await expect(page.getByText(/base:\s*Paper Day-Trade Execution/)).toBeVisible();

    const nodeBoxAfterSelect = await tradingNode.boundingBox();
    expect(nodeBoxAfterSelect).not.toBeNull();
    expect(Math.abs(nodeBoxBeforeSelect!.width - nodeBoxAfterSelect!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(nodeBoxBeforeSelect!.height - nodeBoxAfterSelect!.height)).toBeLessThanOrEqual(
      1,
    );

    await page.getByRole('button', { name: 'Close inspector' }).click();
    await expect(page.getByRole('button', { name: 'Close inspector' })).not.toBeVisible();

    await topicField.fill('Semiconductors, infrastructure');
    await allocationField.fill('25');
    await targetExitField.fill('2099-01-02T10:30');
    const setupResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/companies/${companyId}/modules/`) &&
        response.request().method() === 'PATCH',
    );
    await tradingNode.getByRole('button', { name: 'Save setup' }).click();
    expect((await setupResponse).ok()).toBe(true);

    await expect(tradingNode.getByText('Set · Topic / sector', { exact: true })).toHaveCount(0);
    await expect(tradingNode.getByLabel('Confirmed: Topic / sector')).toBeVisible();
    await expect(tradingNode.getByLabel('Confirmed: Capital allocation')).toBeVisible();
    await expect(tradingNode.getByLabel('Confirmed: Target exit')).toBeVisible();
    await expect(topicField).toHaveClass(/border-\[var\(--color-line\)\]/);
    await expect(allocationField).toHaveClass(/border-\[var\(--color-line\)\]/);
    await expect(targetExitField).toHaveClass(/border-\[var\(--color-line\)\]/);

    await tradingNode.getByText('Trading', { exact: true }).click();
    const inspectorName = page.locator('aside').getByLabel('Name', { exact: true });
    await expect(inspectorName).toBeVisible();
    await inspectorName.fill('E2E Custom Trading Desk');
    const renameResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/companies/${companyId}/modules/`) &&
        response.request().method() === 'PATCH',
    );
    await inspectorName.blur();
    expect((await renameResponse).ok()).toBe(true);

    const restoreGeneratedName = page.getByRole('button', {
      name: 'Restore generated name',
      exact: true,
    });
    await expect(restoreGeneratedName).toBeVisible();
    await expect(tradingNode).toContainText('E2E Custom Trading Desk');

    const restoreResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/companies/${companyId}/modules/`) &&
        response.request().method() === 'PATCH',
    );
    await restoreGeneratedName.click();
    expect((await restoreResponse).ok()).toBe(true);
    await expect(restoreGeneratedName).not.toBeVisible();
    await expect(tradingNode).toContainText('Paper Day-Trade Execution');

    await page.getByRole('button', { name: 'Close inspector' }).click();
    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });
});
