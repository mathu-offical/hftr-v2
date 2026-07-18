import { archiveCompany, createCompanyApiBody, e2eCompanyName, expect, test } from './fixtures';

test.describe('Canvas node dashboard (D-026)', () => {
  test('keeps trading setup fixed and restores generated names', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    test.setTimeout(90_000);

    // API create with day trading only (no UI research-dep pack) keeps Trading findable.
    const create = await request.post('/api/companies', {
      data: createCompanyApiBody(e2eCompanyName('canvas-dashboard'), {
        philosophyPrompt: 'E2E paper desk for focused canvas dashboard verification.',
        engines: [{ templateId: 'engine_day_trading', inputs: {} }],
      }),
    });
    expect(create.ok()).toBeTruthy();
    const { company } = (await create.json()) as { company: { id: string } };
    const companyId = company.id;
    createdCompanyIds.push(companyId);

    await page.goto(`/companies/${companyId}`);

    const collapseInfoPanel = page.getByRole('button', { name: /Collapse info panel/ });
    if (await collapseInfoPanel.isVisible().catch(() => false)) {
      await collapseInfoPanel.click();
      await expect(page.getByRole('button', { name: /Expand info panel/ })).toBeVisible();
    }

    const canvas = page.locator('.react-flow');
    const tradingNode = canvas
      .locator('.react-flow__node')
      .filter({ has: page.getByText('Trading', { exact: true }) });
    await expect(tradingNode).toBeVisible({ timeout: 45_000 });
    await tradingNode.scrollIntoViewIfNeeded();
    await expect(tradingNode).toContainText('DayTrade ·');

    await expect(tradingNode.getByText('Required · Topic / sector', { exact: true })).toBeVisible();
    // API create pre-fills capital/exit (D-035) — chips are Confirmed, not Required.
    await expect(tradingNode.getByLabel('Confirmed: Capital allocation')).toBeVisible();
    await expect(tradingNode.getByLabel('Confirmed: Target exit')).toBeVisible();

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
      'Data feed output',
      'Directive output',
      'Verification output',
    ] as const) {
      await expect(tradingNode.getByLabel(handleLabel, { exact: true })).toBeAttached();
    }

    // Shell panel overlays intercept RF pointer events — force node interactions.
    await topicField.click({ force: true });
    await expect(page.getByRole('button', { name: 'Close inspector' })).not.toBeVisible();

    const nodeBoxBeforeSelect = await tradingNode.boundingBox();
    expect(nodeBoxBeforeSelect).not.toBeNull();
    await tradingNode.getByText('Trading', { exact: true }).click({ force: true });
    await expect(page.getByText(/Generated compact label/)).toBeVisible();
    await expect(page.getByText(/function:\s*DayTrade/)).toBeVisible();

    const nodeBoxAfterSelect = await tradingNode.boundingBox();
    expect(nodeBoxAfterSelect).not.toBeNull();
    expect(Math.abs(nodeBoxBeforeSelect!.width - nodeBoxAfterSelect!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(nodeBoxBeforeSelect!.height - nodeBoxAfterSelect!.height)).toBeLessThanOrEqual(
      1,
    );

    await page.getByRole('button', { name: 'Close inspector' }).click();
    await expect(page.getByRole('button', { name: 'Close inspector' })).not.toBeVisible();

    await topicField.fill('Semiconductors, infrastructure', { force: true });
    await allocationField.fill('25', { force: true });
    await targetExitField.fill('2099-01-02T10:30', { force: true });
    const setupResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/companies/${companyId}/modules/`) &&
        response.request().method() === 'PATCH',
    );
    await tradingNode.getByRole('button', { name: 'Save setup' }).click({ force: true });
    expect((await setupResponse).ok()).toBe(true);

    await expect(tradingNode.getByText('Set · Topic / sector', { exact: true })).toHaveCount(0);
    await expect(tradingNode.getByLabel('Confirmed: Topic / sector')).toBeVisible();
    await expect(tradingNode.getByLabel('Confirmed: Capital allocation')).toBeVisible();
    await expect(tradingNode.getByLabel('Confirmed: Target exit')).toBeVisible();
    await expect(topicField).toHaveClass(/border-\[var\(--color-line\)\]/);
    await expect(allocationField).toHaveClass(/border-\[var\(--color-line\)\]/);
    await expect(targetExitField).toHaveClass(/border-\[var\(--color-line\)\]/);

    await tradingNode.getByText('Trading', { exact: true }).click({ force: true });
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
    await expect(tradingNode).toContainText('DayTrade ·');

    await page.getByRole('button', { name: 'Close inspector' }).click();
    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });
});
