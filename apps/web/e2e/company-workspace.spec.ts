import {
  archiveCompany,
  companyNameField,
  createCompanyFromTemplate,
  e2eCompanyName,
  expect,
  openNewCompanyForm,
  test,
} from './fixtures';

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

    await openNewCompanyForm(page);
    await companyNameField(page).fill(companyName);
    await page.getByLabel(/Philosophy/).fill(philosophy);
    await createCompanyFromTemplate(page, /Day trading starter/);
    const companyId = page.url().split('/').pop()!;
    createdCompanyIds.push(companyId);

    // Top ribbon: paper mode chip (text-first per ui-spec).
    await expect(page.getByText('paper', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Company ▾' }).click();
    await page.getByRole('button', { name: 'LLM / operating' }).click();
    await expect(page.getByText('Provider operating budgets')).toBeVisible();
    await expect(page.getByText(/separate from module trading-capital allocations/)).toBeVisible();
    // Policy block loads async after llm-policy fetch.
    await expect(page.getByText('LLM privacy & models')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Recent LLM calls')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Close ▲' }).click();

    // Full seeded engine: compact Fn · Focus labels (connection refs on muted line).
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible();
    for (const [typeLabel, primary] of [
      ['Math', 'Math ·'],
      ['Research', 'Research ·'],
      ['Library', 'Library ·'],
      ['Live API', 'LiveAPI ·'],
      ['Trend', 'Trend ·'],
      ['Trading', 'DayTrade ·'],
      ['Holding fund', 'Fund ·'],
      ['Fund router', 'Router ·'],
      ['Analyzer', 'Analyze ·'],
      ['Policy', 'Policy ·'],
    ] as const) {
      const node = canvas
        .locator('.react-flow__node')
        .filter({ has: page.getByText(typeLabel, { exact: true }) })
        .filter({ hasText: primary });
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
    await expect(tradingNode).toContainText('DayTrade ·');

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
    await expect(page.getByText(/Generated compact label/)).toBeVisible();
    await expect(page.getByText(/function:\s*DayTrade/)).toBeVisible();
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
    await expect(tradingNode.getByLabel('Confirmed: Topic / sector')).toBeVisible();
    await expect(tradingNode.getByLabel('Confirmed: Capital allocation')).toBeVisible();
    await expect(tradingNode.getByLabel('Confirmed: Target exit')).toBeVisible();
    await expect(tradingNode.getByLabel('Topic / sector', { exact: true })).toHaveClass(
      /border-\[var\(--color-line\)\]/,
    );
    await expect(tradingNode.getByLabel('Capital allocation value', { exact: true })).toHaveClass(
      /border-\[var\(--color-line\)\]/,
    );
    await expect(tradingNode.getByLabel('Target exit date / time', { exact: true })).toHaveClass(
      /border-\[var\(--color-line\)\]/,
    );

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
    await expect(tradingNode).toContainText('DayTrade ·');

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
    // Right panel can overlay the bottom strip — force collapse when obstructed.
    await page.getByRole('button', { name: /Collapse bottom panel/ }).click({ force: true });
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

    // Floating store launchers for modules and engines.
    await expect(page.getByRole('button', { name: 'Open modules store' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open engines store' })).toBeVisible();
    await page.getByRole('button', { name: 'Open modules store' }).click();
    await expect(page.getByRole('button', { name: 'Modules', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Engines', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close store' }).click();
    await expect(page.getByRole('button', { name: 'Open modules store' })).toBeVisible();
    await page.getByRole('button', { name: 'Open engines store' }).click();
    await expect(page.getByLabel('Engines store')).toBeVisible();
    await page.getByRole('button', { name: 'Close store' }).click();

    // Canvas settings hosts reflow + clear-canvas confirm.
    await page.getByRole('button', { name: 'Canvas settings' }).click();
    await expect(page.getByRole('menuitem', { name: 'Reflow canvas' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Clear canvas…' }).click();
    await expect(page.getByRole('heading', { name: 'Clear canvas?' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Clear canvas?' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Canvas settings' }).click();
    await page.getByRole('menuitem', { name: 'Clear canvas…' }).click();
    await expect(page.getByRole('heading', { name: 'Clear canvas?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Clear canvas?' })).toHaveCount(0);

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
