import {
  archiveCompany,
  companyNameField,
  createCompanyFromTemplate,
  e2eCompanyName,
  expect,
  openNewCompanyForm,
  test,
} from './fixtures';

test.describe('Galaxy hover cards (D-100)', () => {
  test.setTimeout(180_000);

  test('galaxy shows hover card with nest path and usage lines', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const companyName = e2eCompanyName('galaxy-hover');
    await openNewCompanyForm(page);
    await companyNameField(page).fill(companyName);
    await page.getByLabel(/Philosophy/).fill('E2E D-100 galaxy hover card live check.');
    await createCompanyFromTemplate(page, /Day trading starter/);

    const companyId = page.url().split('/').pop()!;
    createdCompanyIds.push(companyId);

    // Graph GET runs bootstrap (~tens of seconds on cold companies).
    await expect
      .poll(
        async () => {
          const graphRes = await request.get(`/api/companies/${companyId}/research/graph`);
          if (!graphRes.ok()) return 0;
          const graph = (await graphRes.json()) as { nodes: unknown[] };
          return graph.nodes?.length ?? 0;
        },
        { timeout: 90_000 },
      )
      .toBeGreaterThan(0);

    const graphRes = await request.get(`/api/companies/${companyId}/research/graph`);
    const graph = (await graphRes.json()) as {
      nodes: Array<{
        id: string;
        title: string;
        tags: string[];
        referenceCount?: number;
        queryCount?: number;
      }>;
    };
    const target = graph.nodes[0]!;

    await page.getByRole('button', { name: /Expand left panel/ }).click();
    await expect(page.getByTestId('research-overlay')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('galaxy-view')).toBeVisible();

    // Clear any accidental library nest filter from shelf navigation.
    const clearLibs = page.getByTestId('galaxy-clear-library-filters');
    if (await clearLibs.isVisible().catch(() => false)) {
      await clearLibs.click();
    }

    await expect(page.getByTestId('galaxy-empty')).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByTestId('galaxy-loading')).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByText('Hover · inspect · click opens panel')).toBeVisible({
      timeout: 30_000,
    });

    const shown = await page.evaluate((conceptId) => {
      const api = (
        window as unknown as {
          __hftrGalaxyHoverTest?: { showConcept: (id: string) => boolean };
        }
      ).__hftrGalaxyHoverTest;
      return api?.showConcept(conceptId) ?? false;
    }, target.id);
    expect(shown).toBe(true);

    const card = page.getByTestId('galaxy-hover-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(target.title.replace(/_/g, ' '));

    if ((target.referenceCount ?? 0) > 0 || (target.queryCount ?? 0) > 0) {
      await expect(card).toContainText(/Queried|Referenced/);
    }

    await page.evaluate(() => {
      (
        window as unknown as { __hftrGalaxyHoverTest?: { clear: () => void } }
      ).__hftrGalaxyHoverTest?.clear();
    });
    await expect(card).toHaveCount(0);
    await expect(page.getByText('Hover · inspect · click opens panel')).toBeVisible();

    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });
});
