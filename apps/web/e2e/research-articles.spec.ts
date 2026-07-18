import {
  archiveCompany,
  createCompanyApiBody,
  e2eCompanyName,
  expect,
  test,
} from './fixtures';

test.describe('Research articles (D-127)', () => {
  test.setTimeout(120_000);

  test('Articles panel, library-backed submit with tags, librarian actions on runtime library', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const companyName = e2eCompanyName('research-articles');
    const createRes = await request.post('/api/companies', {
      data: createCompanyApiBody(companyName, {
        philosophyPrompt: 'E2E research articles + librarian actions.',
      }),
    });
    expect(createRes.ok()).toBeTruthy();
    const { company } = (await createRes.json()) as { company: { id: string } };
    const companyId = company.id;
    createdCompanyIds.push(companyId);

    const modulesRes = await request.get(`/api/companies/${companyId}/modules`);
    expect(modulesRes.ok()).toBeTruthy();
    const { modules } = (await modulesRes.json()) as {
      modules: Array<{ id: string; type: string; status: string }>;
    };
    const research = modules.find((m) => m.type === 'research');
    expect(research).toBeTruthy();
    if (research!.status !== 'active') {
      const activateRes = await request.patch(
        `/api/companies/${companyId}/modules/${research!.id}`,
        {
          data: {
            status: 'active',
            setup: { topicSectors: ['technology'] },
          },
        },
      );
      expect(activateRes.ok()).toBeTruthy();
    }

    const libCreate = await request.post(`/api/companies/${companyId}/libraries`, {
      data: { name: 'E2E Article Shelf', topicScope: 'e2e articles' },
    });
    expect(libCreate.ok()).toBeTruthy();
    const { library } = (await libCreate.json()) as { library: { id: string; name: string } };

    const submitRes = await request.post(`/api/companies/${companyId}/research/submit`, {
      data: {
        moduleId: research!.id,
        kind: 'text',
        title: 'E2E Article With Tags',
        content: 'Operator article body for D-127 verification.',
        libraryId: library.id,
        tags: ['Macro', 'Rates', 'Policy'],
      },
    });
    expect(submitRes.ok()).toBeTruthy();
    const submitBody = (await submitRes.json()) as { conceptId: string; libraryId: string | null };
    expect(submitBody.conceptId).toBeTruthy();
    expect(submitBody.libraryId).toBe(library.id);

    const articlesRes = await request.get(`/api/companies/${companyId}/concepts?kind=article`);
    expect(articlesRes.ok()).toBeTruthy();
    const { concepts: articles } = (await articlesRes.json()) as {
      concepts: Array<{ id: string; title: string; tags: string[] }>;
    };
    const article = articles.find((c) => c.id === submitBody.conceptId);
    expect(article).toBeTruthy();
    expect(article!.tags).toContain('hftr:article');
    expect(article!.tags).toEqual(expect.arrayContaining(['Macro', 'Rates', 'Policy']));

    const refreshRes = await request.post(
      `/api/companies/${companyId}/libraries/${library.id}/actions`,
      { data: { action: 'refresh', moduleId: research!.id } },
    );
    expect(refreshRes.ok()).toBeTruthy();
    const refreshBody = (await refreshRes.json()) as { action: string; refreshed?: boolean };
    expect(refreshBody.action).toBe('refresh');
    expect(refreshBody.refreshed).toBe(true);

    const verifyRes = await request.post(
      `/api/companies/${companyId}/libraries/${library.id}/actions`,
      { data: { action: 'verify', moduleId: research!.id } },
    );
    expect(verifyRes.ok()).toBeTruthy();

    await page.goto(`/companies/${companyId}`);
    await page.getByRole('button', { name: /Expand left panel/ }).click();
    await expect(page.getByTestId('research-articles-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`research-article-${submitBody.conceptId}`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId(`research-article-${submitBody.conceptId}`)).toContainText(
      'Macro',
    );
    await expect(page.getByTestId('research-submit-article')).toBeVisible();

    const dockCard = page.getByTestId('research-libraries-dock-card');
    if (await dockCard.isVisible().catch(() => false)) {
      await dockCard.click();
    }
    await expect(page.getByTestId(`library-librarian-actions-${library.id}`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByTestId(`library-librarian-actions-${library.id}`).getByRole('button', {
        name: 'Curate',
      }),
    ).toBeVisible();

    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });
});
