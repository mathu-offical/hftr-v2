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
    const graph = (await graphRes.json()) as {
      libraries: Array<{ id: string; name: string; masterLibrary?: boolean }>;
      nodes: Array<{ id: string; title?: string; name?: string }>;
    };
    expect(Array.isArray(graph.libraries)).toBeTruthy();
    // D-044: compile-time catalog mechanisms materialize into galaxy on first graph load.
    expect(graph.libraries.length).toBeGreaterThanOrEqual(1);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(8);
    const titles = graph.nodes.map((n) => n.title ?? n.name ?? '').join(' ');
    expect(titles).toMatch(/opening_range_breakout/);

    const topicsListRes = await request.get(`/api/companies/${companyId}/research/topics`);
    expect(topicsListRes.ok()).toBeTruthy();
    const { topics: listedTopics } = (await topicsListRes.json()) as {
      topics: Array<{ title: string }>;
    };
    expect(listedTopics.some((t) => t.title === 'Seeded trading mechanisms')).toBeTruthy();

    const graphConceptCount = graph.nodes?.length ?? 0;
    if (graphConceptCount > 0) {
      const concepts = graph.nodes.slice(0, Math.min(3, graphConceptCount)).map((node, index) => ({
        conceptId: node.id,
        sortOrder: index,
      }));
      const membershipRes = await request.put(
        `/api/companies/${companyId}/research/topics/${topic.id}/concepts`,
        { data: { concepts } },
      );
      expect(membershipRes.ok()).toBeTruthy();
    }

    const detailRes = await request.get(`/api/companies/${companyId}/research/topics/${topic.id}`);
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()) as {
      topic: { synopsisMd: string; queryCount: number };
    };
    expect(detail.topic.synopsisMd).toContain('Overview');
    expect(detail.topic.queryCount).toBeGreaterThanOrEqual(1);

    const patchRes = await request.patch(
      `/api/companies/${companyId}/research/topics/${topic.id}`,
      {
        data: { synopsisMd: 'allocate 500 dollars immediately' },
      },
    );
    expect(patchRes.status()).toBe(422);
    const patchBody = (await patchRes.json()) as { error: string };
    expect(patchBody.error).toBe('synopsis_leak_lint_failed');

    await page.reload();
    await page.getByRole('button', { name: /Expand left panel/ }).click();
    await expect(page.getByTestId(`research-topic-${topic.id}`)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: `Select topic E2E Topic Nest` }).click();

    await expect(page.getByTestId('research-overlay')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('galaxy-view')).toBeVisible();
    await expect(page.getByTestId('research-tab-galaxy')).toHaveAttribute('aria-pressed', 'true');

    if (graphConceptCount > 0) {
      await expect(page.getByText(/Focused \d+ concepts/)).toBeVisible({ timeout: 10_000 });
    }

    await page.getByTestId('research-tab-article').click();
    await expect(page.getByText('Synopsis', { exact: true })).toBeVisible();
    await expect(page.getByText('Semantic synopsis for semiconductors.')).toBeVisible();

    await page.getByTestId('article-edit-synopsis').click();
    await expect(page.getByTestId('article-synopsis-editor')).toBeVisible();
    await page
      .getByTestId('article-synopsis-editor')
      .fill('## Overview\nUpdated synopsis for semiconductors after operator edit.');
    await page.getByTestId('article-save-synopsis').click();
    await expect(
      page.getByText('Updated synopsis for semiconductors after operator edit.'),
    ).toBeVisible({
      timeout: 10_000,
    });

    if ((graph.libraries?.length ?? 0) > 0) {
      await page.getByTestId('research-tab-galaxy').click();
      await expect(page.getByRole('toolbar', { name: 'Library nest filters' })).toBeVisible({
        timeout: 15_000,
      });
    }

    if (graphConceptCount > 0) {
      await page.getByTestId('research-tab-article').click();
      await expect(page.getByText('Member concepts', { exact: true })).toBeVisible();
    } else {
      await page.getByTestId('research-tab-galaxy').click();
      await expect(page.getByTestId('galaxy-view')).toBeVisible();
    }

    await archiveCompany(request, companyId);
    createdCompanyIds.length = 0;
  });
});
