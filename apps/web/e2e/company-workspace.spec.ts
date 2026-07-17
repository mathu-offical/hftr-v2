import { archiveCompany, e2eCompanyName, expect, test } from './fixtures';

test.describe('Company workspace (M1 read flows)', () => {
  // Expanded D-026 dashboard assertions + assistant persistence need headroom on cold compile.
  test.setTimeout(90_000);

  test('day_trading_starter canvas, panels, and module store', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const companyName = e2eCompanyName('day-trading');
    const philosophy = 'E2E paper desk — patient entries, fast exits on invalidation.';

    await page.goto('/companies');
    await page.getByRole('button', { name: 'New company' }).click();

    await page.getByLabel('Name').fill(companyName);
    await page.getByLabel(/Philosophy/).fill(philosophy);
    await page.getByRole('button', { name: /Day trading starter/ }).click();
    await page.getByRole('button', { name: 'Skip setup & open canvas' }).click();

    await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/);
    const companyId = page.url().split('/').pop()!;
    createdCompanyIds.push(companyId);

    // Top ribbon: paper mode chip (text-first per ui-spec).
    await expect(page.getByText('paper', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Company ▾' }).click();
    await page.getByRole('button', { name: 'LLM / operating' }).click();
    await expect(page.getByText('Provider operating budgets')).toBeVisible();
    await expect(page.getByText(/separate from module trading-capital allocations/)).toBeVisible();
    await expect(page.getByText('LLM privacy & models')).toBeVisible();
    await expect(page.getByText('Recent LLM calls')).toBeVisible();
    await page.getByRole('button', { name: 'Close ▲' }).click();

    // Full seeded engine: named research/data/trend/execution/funds/policy functions.
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible();
    for (const [typeLabel, baseName] of [
      ['Math', 'Deterministic Math Calculator'],
      ['Research', 'Market Regime Research'],
      ['Library', 'Strategy Evidence Library'],
      ['Live API', 'Paper Market & Runtime Feed'],
      ['Trend', 'Market Trend Scanner'],
      ['Trading', 'Paper Day-Trade Execution'],
      ['Holding fund', 'Paper Seed Holding Fund'],
      ['Fund router', 'Deterministic Fund Router'],
      ['Analyzer', 'Transaction Execution Monitor'],
      ['Policy', 'Paper Trading Policy'],
    ] as const) {
      const node = canvas
        .locator('.react-flow__node')
        .filter({ has: page.getByText(typeLabel, { exact: true }) })
        .filter({ hasText: baseName });
      await expect(node).toBeVisible();
    }
    await expect(canvas.locator('.react-flow__edge-smoothstep')).toHaveCount(10);
    await expect(canvas.getByText('Required · Topic / sector').first()).toBeVisible();
    await expect(canvas.getByText('Required · Capital allocation').first()).toBeVisible();

    // Right panel is open by default and can occlude in-node setup controls — collapse first.
    await expect(page.getByText('Paper balance')).toBeVisible();
    await page.getByRole('button', { name: /Collapse info panel/ }).click();
    await expect(page.getByRole('button', { name: /Expand info panel/ })).toBeVisible();

    // D-026: fixed dashboard trading node — fields always visible; chrome opens inspector.
    const tradingNode = canvas
      .locator('.react-flow__node')
      .filter({ has: page.getByText('Trading', { exact: true }) });
    await expect(tradingNode).toContainText('Paper Day-Trade Execution');

    await expect(tradingNode.getByText('Required · Topic / sector')).toBeVisible();
    await expect(tradingNode.getByText('Required · Capital allocation')).toBeVisible();
    await expect(tradingNode.getByText('Required · Target exit')).toBeVisible();
    await expect(tradingNode.getByLabel('Topic / sector')).toBeVisible();
    await expect(tradingNode.getByLabel('Topic / sector')).toBeEditable();
    await expect(tradingNode.getByLabel('Capital allocation value')).toBeVisible();
    await expect(tradingNode.getByLabel('Capital allocation value')).toBeEditable();
    await expect(tradingNode.getByLabel('Target exit date / time')).toBeVisible();
    await expect(tradingNode.getByLabel('Target exit date / time')).toBeEditable();

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

    await tradingNode.getByLabel('Topic / sector').click();
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

    await tradingNode.getByLabel('Topic / sector').fill('Semiconductors, infrastructure');
    await tradingNode.getByLabel('Capital allocation value').fill('25');
    await tradingNode.getByLabel('Target exit date / time').fill('2099-01-02T10:30');
    const setupResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/companies/${companyId}/modules/`) &&
        response.request().method() === 'PATCH',
    );
    await tradingNode.getByRole('button', { name: 'Save setup' }).click();
    expect((await setupResponse).ok()).toBe(true);
    await expect(tradingNode.getByText('Set · Topic / sector')).toBeVisible();
    await expect(tradingNode.getByText('Set · Capital allocation')).toBeVisible();
    await expect(tradingNode.getByText('Set · Target exit')).toBeVisible();

    const inspectorName = page.locator('aside').getByLabel('Name');
    await inspectorName.fill('E2E Custom Trading Desk');
    const renameResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/companies/${companyId}/modules/`) &&
        response.request().method() === 'PATCH',
    );
    await inspectorName.blur();
    expect((await renameResponse).ok()).toBe(true);
    await expect(page.getByRole('button', { name: 'Restore generated name' })).toBeVisible();
    await expect(tradingNode).toContainText('E2E Custom Trading Desk');

    const restoreResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/companies/${companyId}/modules/`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Restore generated name' }).click();
    expect((await restoreResponse).ok()).toBe(true);
    await expect(page.getByRole('button', { name: 'Restore generated name' })).not.toBeVisible();
    await expect(tradingNode).toContainText('Paper Day-Trade Execution');

    await page.getByRole('button', { name: 'Close inspector' }).click();

    // Left panel: collapsed by default — expand via button, then collapse.
    const expandLeft = page.getByRole('button', { name: /Expand left panel/ });
    await expect(expandLeft).toBeVisible();
    await expandLeft.click();
    await expect(page.getByRole('button', { name: 'Research', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Collapse left panel/ }).click();
    await expect(expandLeft).toBeVisible();

    // Right panel: re-expand, then collapse/expand cycle.
    await page.getByRole('button', { name: /Expand info panel/ }).click();
    await expect(page.getByText('Paper balance')).toBeVisible();
    await page.getByRole('button', { name: /Collapse info panel/ }).click();
    await expect(page.getByRole('button', { name: /Expand info panel/ })).toBeVisible();
    await page.getByRole('button', { name: /Expand info panel/ }).click();
    await expect(page.getByText('Paper balance')).toBeVisible();

    // Bottom panel: collapsed by default — expand via button, then collapse.
    const expandBottom = page.getByRole('button', { name: /Expand bottom panel/ });
    await expect(expandBottom).toBeVisible();
    await expandBottom.click();
    await expect(page.getByRole('button', { name: 'Trends', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Collapse bottom panel/ }).click();
    await expect(expandBottom).toBeVisible();

    // Keyboard shortcuts per ui-spec §8 (`[`, `]`, backtick).
    await page.keyboard.press('[');
    await expect(page.getByRole('button', { name: 'Research', exact: true })).toBeVisible();
    await page.keyboard.press('[');
    await expect(expandLeft).toBeVisible();

    await page.keyboard.press(']');
    await expect(page.getByRole('button', { name: /Expand info panel/ })).toBeVisible();
    await page.keyboard.press(']');
    await expect(page.getByText('Paper balance')).toBeVisible();

    await page.keyboard.press('`');
    await expect(page.getByRole('button', { name: 'Trends', exact: true })).toBeVisible();
    await page.keyboard.press('`');
    await expect(expandBottom).toBeVisible();

    // Module store floating button exposes Modules and Engines sections.
    await page.getByRole('button', { name: 'Open module store' }).click();
    await expect(page.getByRole('button', { name: 'Modules', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Engines', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close module store' }).click();
    await expect(page.getByRole('button', { name: 'Open module store' })).toBeVisible();

    // Read-only assistant persists company-scoped history in the database.
    await page.getByRole('button', { name: 'Open read-only assistant' }).click();
    await page.getByLabel('Assistant message').fill('Show queue status');
    const assistantResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/companies/${companyId}/assistant`) &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    expect((await assistantResponse).ok()).toBeTruthy();
    await expect(page.getByText(/Read-only lookup via queue status/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('queue status', { exact: true })).toBeVisible();

    await page.getByLabel('Assistant message').fill('hello there');
    const capabilitiesResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/companies/${companyId}/assistant`) &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    expect((await capabilitiesResponse).ok()).toBeTruthy();
    await expect(page.getByText(/I can look up:/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('capabilities', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Close assistant' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Open read-only assistant' }).click();
    await expect(page.getByText(/Read-only lookup via queue status/)).toBeVisible({
      timeout: 20_000,
    });

    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });
});
