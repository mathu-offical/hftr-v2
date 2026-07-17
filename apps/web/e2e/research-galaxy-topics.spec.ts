import {
  archiveCompany,
  companyNameField,
  createCompanyFromTemplate,
  e2eCompanyName,
  expect,
  openNewCompanyForm,
  test,
} from './fixtures';

test.describe('Research topics galaxy overlay (D-040)', () => {
  test.setTimeout(120_000);

  test('topic select opens overlay with galaxy and article tab', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const companyName = e2eCompanyName('research-topics');
    const philosophy = 'E2E D-040 topics, nested galaxy, hybrid article.';

    await openNewCompanyForm(page);
    await companyNameField(page).fill(companyName);
    await page.getByLabel(/Philosophy/).fill(philosophy);
    await createCompanyFromTemplate(page, /Day trading starter/);

    const companyId = page.url().split('/').pop()!;
    createdCompanyIds.push(companyId);

    const modulesRes = await request.get(`/api/companies/${companyId}/modules`);
    expect(modulesRes.ok()).toBeTruthy();
    const { modules } = (await modulesRes.json()) as {
      modules: Array<{ id: string; type: string }>;
    };
    const researchMod = modules.find((m) => m.type === 'research');
    expect(researchMod).toBeTruthy();

    const topicRes = await request.post(`/api/companies/${companyId}/research/topics`, {
      data: {
        moduleId: researchMod!.id,
        title: 'E2E Topic Nest',
        priority: 'normal',
        synopsisMd: '## Overview\nSemantic synopsis for semiconductors.',
      },
    });
    expect(topicRes.ok()).toBeTruthy();
    const { topic } = (await topicRes.json()) as { topic: { id: string } };

    const graphRes = await request.get(`/api/companies/${companyId}/research/graph`);
    expect(graphRes.ok()).toBeTruthy();
    const graph = (await graphRes.json()) as { libraries: unknown[] };
    expect(Array.isArray(graph.libraries)).toBeTruthy();

    const detailRes = await request.get(`/api/companies/${companyId}/research/topics/${topic.id}`);
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()) as {
      topic: { synopsisMd: string; queryCount: number };
    };
    expect(detail.topic.synopsisMd).toContain('Overview');
    expect(detail.topic.queryCount).toBeGreaterThanOrEqual(1);

    await page.reload();
    await page.getByRole('button', { name: /Expand left panel/ }).click();
    await expect(page.getByTestId(`research-topic-${topic.id}`)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: `Select topic E2E Topic Nest` }).click();

    await expect(page.getByTestId('research-overlay')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('galaxy-view')).toBeVisible();
    await expect(page.getByTestId('research-tab-galaxy')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('research-tab-article').click();
    await expect(page.getByText('Synopsis', { exact: true })).toBeVisible();
    await expect(page.getByText('Semantic synopsis for semiconductors.')).toBeVisible();

    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });
});
