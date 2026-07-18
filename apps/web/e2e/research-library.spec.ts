import {
  archiveCompany,
  companyNameField,
  createCompanyFromTemplate,
  e2eCompanyName,
  expect,
  openNewCompanyForm,
  test,
} from './fixtures';

test.describe('Research library surfaces (M2)', () => {
  test.setTimeout(90_000);

  test('left panel shows libraries, galaxy toggle, concepts browser, and Obsidian export', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const companyName = e2eCompanyName('research-ui');
    const philosophy = 'E2E research UI — libraries, galaxy, export, and concepts in left panel.';

    await openNewCompanyForm(page);
    await companyNameField(page).fill(companyName);
    await page.getByLabel(/Philosophy/).fill(philosophy);
    await createCompanyFromTemplate(page, /Day trading starter/);

    const companyId = page.url().split('/').pop()!;
    createdCompanyIds.push(companyId);

    const libraryRes = await request.post(`/api/companies/${companyId}/libraries`, {
      data: { name: 'E2E Export Library', topicScope: 'semiconductors' },
    });
    expect(libraryRes.ok()).toBeTruthy();
    const { library } = (await libraryRes.json()) as { library: { id: string } };

    const conceptsRes = await request.get(`/api/companies/${companyId}/concepts`);
    expect(conceptsRes.ok()).toBeTruthy();
    const { concepts } = (await conceptsRes.json()) as { concepts: Array<{ id: string }> };
    if (concepts[0]) {
      const curateRes = await request.post(
        `/api/companies/${companyId}/libraries/${library.id}/curate`,
        { data: { conceptId: concepts[0].id, curationStatus: 'accepted' } },
      );
      expect(curateRes.ok()).toBeTruthy();
    }

    const exportRes = await request.get(
      `/api/companies/${companyId}/libraries/${library.id}/export`,
    );
    expect(exportRes.ok()).toBeTruthy();
    expect(exportRes.headers()['content-type']).toContain('application/zip');

    await page.getByRole('button', { name: /Expand left panel/ }).click();
    await expect(page.getByRole('button', { name: 'Research + Libraries', exact: true })).toBeVisible();

    await expect(page.getByTestId('research-new-topic')).toBeVisible();
    await expect(page.getByTestId('research-entity-search')).toBeVisible();
    await expect(page.getByTestId('research-library-shelves')).toBeVisible();
    await expect(page.getByTestId('research-pages-list')).toBeVisible();

    await page.getByText('Modules & tools').click();
    await expect(page.getByRole('region', { name: 'Libraries' })).toBeVisible();
    await expect(page.getByText('E2E Export Library')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Export E2E Export Library to Obsidian zip' }),
    ).toBeVisible();

    await expect(page.getByTestId('research-overlay')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('galaxy-view')).toBeVisible();

    await expect(
      page.getByText(/No concepts curated yet|Search concepts|Search galaxy|Topics/).first(),
    ).toBeVisible();

    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });
});
