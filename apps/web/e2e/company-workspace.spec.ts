import { archiveCompany, e2eCompanyName, expect, test } from './fixtures';

test.describe('Company workspace (M1 read flows)', () => {
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
    await page.getByRole('button', { name: 'Create (paper mode)' }).click();

    await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/);
    const companyId = page.url().split('/').pop()!;
    createdCompanyIds.push(companyId);

    // Top ribbon: paper mode chip (text-first per ui-spec).
    await expect(page.getByText('paper', { exact: true }).first()).toBeVisible();

    // Template graph nodes on canvas (Math is auto-provisioned; template adds three modules).
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible();
    for (const nodeName of ['Math', 'Market Feed', 'Trend Scanner', 'Day Desk']) {
      await expect(canvas.locator('.text-sm.font-medium', { hasText: nodeName })).toBeVisible();
    }

    // Left panel: collapsed by default — expand via button, then collapse.
    const expandLeft = page.getByRole('button', { name: /Expand left panel/ });
    await expect(expandLeft).toBeVisible();
    await expandLeft.click();
    await expect(page.getByRole('button', { name: 'Research', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Collapse left panel/ }).click();
    await expect(expandLeft).toBeVisible();

    // Right panel: open by default — collapse via button, then expand.
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
