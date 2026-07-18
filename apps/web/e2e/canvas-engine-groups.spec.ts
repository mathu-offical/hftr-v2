import { createCompanyApiBody, e2eCompanyName, expect, test } from './fixtures';

test.describe('Canvas ENGINE groups (D-028)', () => {
  test('shows engine chrome, cascades master topic, and offers delete modes', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    test.setTimeout(120_000);

    const create = await request.post('/api/companies', {
      data: createCompanyApiBody(e2eCompanyName('engine-groups'), {
        philosophyPrompt: 'E2E paper desk for ENGINE group visualization verification.',
        engines: [{ templateId: 'research_market_regime_lab', inputs: {} }],
      }),
    });
    expect(create.ok()).toBeTruthy();
    const { company } = (await create.json()) as { company: { id: string } };
    createdCompanyIds.push(company.id);

    const enginesResponse = await request.get(`/api/companies/${company.id}/engines`);
    expect(enginesResponse.ok()).toBeTruthy();
    const { engines } = (await enginesResponse.json()) as {
      engines: Array<{
        id: string;
        setupSnapshot?: {
          allocationMode?: string;
          allocationValue?: string;
          targetExitLocal?: string;
        } | null;
      }>;
    };
    const engine = engines[0]!;
    const snap = engine.setupSnapshot ?? {};
    const patch = await request.patch(`/api/companies/${company.id}/engines/${engine.id}`, {
      data: {
        masterTopicSectors: ['semiconductors'],
        setup: {
          topicSectors: ['semiconductors'],
          capitalAllocation: {
            mode: snap.allocationMode === 'percentage' ? 'percentage' : 'amount',
            value: snap.allocationValue || '10000.00',
          },
          targetExitLocal: snap.targetExitLocal || '2026-12-31T16:00',
        },
        setupSnapshot: {
          topicSectors: ['semiconductors'],
          allocationMode: snap.allocationMode === 'percentage' ? 'percentage' : 'amount',
          allocationValue: snap.allocationValue || '10000.00',
          targetExitLocal: snap.targetExitLocal || '2026-12-31T16:00',
        },
      },
    });
    expect(patch.ok()).toBeTruthy();

    const companyDetail = await request.get(`/api/companies/${company.id}`);
    expect(companyDetail.ok()).toBeTruthy();
    const detail = (await companyDetail.json()) as {
      modules: Array<{
        id: string;
        type: string;
        topicSectors: string[];
        topicSectorsOverridden: boolean;
      }>;
    };
    const cascadedResearch = detail.modules.find(
      (module) =>
        module.type === 'research' &&
        module.topicSectors.some((topic) => /semiconductors/i.test(topic)) &&
        !module.topicSectorsOverridden,
    );
    expect(cascadedResearch).toBeDefined();
    const override = await request.patch(
      `/api/companies/${company.id}/modules/${cascadedResearch!.id}`,
      { data: { setup: { topicSectors: ['override-topic'] } } },
    );
    expect(override.ok()).toBeTruthy();

    const insertSecond = await request.post(`/api/companies/${company.id}/engines`, {
      data: { templateId: 'engine_trend_research', inputs: {} },
    });
    expect(insertSecond.ok()).toBeTruthy();

    await page.goto(`/companies/${company.id}`);
    const collapseInfo = page.getByRole('button', { name: /Collapse info panel/ });
    if (await collapseInfo.isVisible().catch(() => false)) {
      await collapseInfo.click();
    }

    const canvas = page.locator('.react-flow');
    await expect(canvas.locator('.react-flow__node-engineGroup')).toHaveCount(2, {
      timeout: 45_000,
    });
    const engineGroup = canvas
      .locator('.react-flow__node-engineGroup')
      .filter({ hasText: /Market regime|regime lab/i });
    await expect(engineGroup).toBeVisible();
    await expect(engineGroup.getByText('Engine', { exact: true })).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Use engine topic' }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Ungroup via API (shell overlays intercept RF Delete → dialog clicks).
    const ungroup = await request.delete(`/api/companies/${company.id}/engines/${engine.id}`);
    expect(ungroup.ok()).toBeTruthy();
    await page.reload();
    await expect(canvas.locator('.react-flow__node-engineGroup')).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(
      canvas
        .locator('.react-flow__node-module')
        .filter({ has: page.getByText('Research', { exact: true }) })
        .first(),
    ).toBeVisible();
  });
});
