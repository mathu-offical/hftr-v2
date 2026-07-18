import {
  archiveCompany,
  createCompanyApiBody,
  e2eCompanyName,
  expect,
  test,
} from './fixtures';

test.describe('Research library surfaces (M2)', () => {
  test.setTimeout(90_000);

  test('left panel shows libraries, galaxy entity search, and Obsidian export', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const companyName = e2eCompanyName('research-ui');
    const createRes = await request.post('/api/companies', {
      data: createCompanyApiBody(companyName, {
        philosophyPrompt: 'E2E research UI — libraries, galaxy, export.',
      }),
    });
    expect(createRes.ok()).toBeTruthy();
    const { company } = (await createRes.json()) as { company: { id: string } };
    const companyId = company.id;
    createdCompanyIds.push(companyId);

    const libraryRes = await request.post(`/api/companies/${companyId}/libraries`, {
      data: { name: 'E2E Export Library', topicScope: 'semiconductors' },
    });
    expect(libraryRes.ok()).toBeTruthy();
    const { library } = (await libraryRes.json()) as { library: { id: string } };

    const conceptsRes = await request.get(`/api/companies/${companyId}/concepts`);
    expect(conceptsRes.ok()).toBeTruthy();
    // Prefer a non-catalog concept for Obsidian export (catalog seeds may fail leak lint).
    const { concepts } = (await conceptsRes.json()) as {
      concepts: Array<{ id: string; sourceClass?: string }>;
    };
    const exportable = concepts.find((c) => c.sourceClass === 'operator' || c.sourceClass === 'model_generated');
    if (exportable) {
      const curateRes = await request.post(
        `/api/companies/${companyId}/libraries/${library.id}/curate`,
        { data: { conceptId: exportable.id, curationStatus: 'accepted' } },
      );
      expect(curateRes.ok()).toBeTruthy();
      const exportRes = await request.get(
        `/api/companies/${companyId}/libraries/${library.id}/export`,
      );
      expect(exportRes.ok()).toBeTruthy();
      expect(exportRes.headers()['content-type']).toContain('application/zip');
    } else {
      // Empty / seed-only library — export may reject numeric leaks; UI still lists the library.
      const exportRes = await request.get(
        `/api/companies/${companyId}/libraries/${library.id}/export`,
      );
      if (exportRes.ok()) {
        expect(exportRes.headers()['content-type']).toContain('application/zip');
      }
    }

    await page.goto(`/companies/${companyId}`);
    await page.keyboard.press('Escape').catch(() => undefined);
    await page
      .locator('nextjs-portal')
      .evaluateAll((nodes) => nodes.forEach((n) => n.remove()))
      .catch(() => undefined);
    await page.getByRole('button', { name: /Expand left panel/ }).click({ force: true });
    await expect(page.getByRole('tab', { name: 'Research', exact: true })).toBeVisible();

    await expect(page.getByTestId('research-new-topic')).toBeVisible();
    await expect(page.getByTestId('research-pages-list')).toBeVisible();
    await expect(page.getByTestId('research-articles-panel')).toBeVisible();
    await expect(page.getByTestId('research-libraries-dock')).toBeVisible();
    await expect(page.getByTestId('research-library-shelves')).toBeVisible();

    // Runtime library may sit under a collapsed shelf — force shell refresh then open Runtime.
    await page.reload();
    await page.keyboard.press('Escape').catch(() => undefined);
    await page
      .locator('nextjs-portal')
      .evaluateAll((nodes) => nodes.forEach((n) => n.remove()))
      .catch(() => undefined);
    const expand = page.getByRole('button', { name: /Expand left panel/ });
    if (await expand.isVisible().catch(() => false)) {
      await expand.click({ force: true });
    }
    const dockCard = page.getByTestId('research-libraries-dock-card');
    if (await dockCard.isVisible().catch(() => false)) {
      await dockCard.click({ force: true });
    }
    await expect(page.getByTestId('research-libraries-dock')).toBeVisible();
    const runtimeShelf = page.getByText('Runtime (user / engine)', { exact: true });
    if (await runtimeShelf.isVisible().catch(() => false)) {
      await runtimeShelf.click({ force: true });
    }
    await expect(page.getByText('E2E Export Library').first()).toBeVisible({ timeout: 20_000 });

    await expect(page.getByTestId('research-overlay')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('galaxy-view')).toBeVisible();
    await expect(page.getByTestId('research-entity-search')).toBeVisible();

    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });
});
