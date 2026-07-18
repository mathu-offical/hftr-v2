import type { APIRequestContext } from '@playwright/test';
import { createCompanyApiBody, e2eCompanyName, expect, test } from './fixtures';

type CompanyModule = { id: string; type: string; status: string };

type CompanyResponse = {
  company: { id: string };
  modules: CompanyModule[];
};

type ActivityResponse = {
  traces: Array<{
    outcome: string;
    venue: string;
    mode: string;
    fills: Array<{ qtyInt: string }>;
  }>;
};

async function createPaperCompany(
  request: APIRequestContext,
  createdCompanyIds: string[],
): Promise<CompanyResponse> {
  const create = await request.post('/api/companies', {
    data: createCompanyApiBody(e2eCompanyName('paper-loop'), {
      philosophyPrompt: 'E2E flow 3 — full paper promote to fill.',
    }),
  });
  expect(create.ok()).toBeTruthy();
  const created = (await create.json()) as { company: { id: string } };
  createdCompanyIds.push(created.company.id);
  const detail = await request.get(`/api/companies/${created.company.id}`);
  expect(detail.ok()).toBeTruthy();
  return (await detail.json()) as CompanyResponse;
}

async function activatePipelineModules(
  request: APIRequestContext,
  company: CompanyResponse,
): Promise<{ trendId: string; tradingId: string }> {
  const trend = company.modules.find((m) => m.type === 'trend');
  const trading = company.modules.find((m) => m.type === 'trading');
  expect(trend).toBeTruthy();
  expect(trading).toBeTruthy();

  const trendPatch = await request.patch(
    `/api/companies/${company.company.id}/modules/${trend!.id}`,
    {
      data: {
        status: 'active',
        setup: { topicSectors: ['Large-cap technology'] },
      },
    },
  );
  expect(trendPatch.ok()).toBeTruthy();

  const tradingPatch = await request.patch(
    `/api/companies/${company.company.id}/modules/${trading!.id}`,
    {
      data: {
        status: 'active',
        setup: {
          topicSectors: ['Large-cap technology'],
          capitalAllocation: { mode: 'percentage', value: '25' },
          targetExitAt: '2099-01-02T15:30:00.000Z',
          timezone: 'America/New_York',
        },
      },
    },
  );
  expect(tradingPatch.ok()).toBeTruthy();

  return { trendId: trend!.id, tradingId: trading!.id };
}

async function promoteUpTrend(
  request: APIRequestContext,
  companyId: string,
  trendModuleId: string,
  tradingModuleId: string,
): Promise<void> {
  const trendResponse = await request.post(`/api/companies/${companyId}/trends`, {
    data: {
      moduleId: trendModuleId,
      symbol: 'AAPL',
      direction: 'up',
      strengthBand: 'strong',
    },
  });
  expect(trendResponse.ok()).toBeTruthy();
  const { trend } = (await trendResponse.json()) as { trend: { id: string } };

  const promote = await request.post(
    `/api/companies/${companyId}/modules/${trendModuleId}/promote`,
    { data: { trendId: trend.id, targetModuleId: tradingModuleId } },
  );
  expect(promote.ok()).toBeTruthy();
}

async function waitForFilledActivity(
  request: APIRequestContext,
  companyId: string,
): Promise<ActivityResponse> {
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/companies/${companyId}/activity`);
        if (!response.ok()) return null;
        const activity = (await response.json()) as ActivityResponse;
        return activity.traces.find((t) => t.outcome === 'filled') ?? null;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();

  const response = await request.get(`/api/companies/${companyId}/activity`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ActivityResponse;
}

test.describe('Paper trading loop (flow 3)', () => {
  test.setTimeout(90_000);

  test('promote AAPL through paper_sim and surfaces fill in panels', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const company = await createPaperCompany(request, createdCompanyIds);
    const { trendId, tradingId } = await activatePipelineModules(request, company);

    await promoteUpTrend(request, company.company.id, trendId, tradingId);
    const activity = await waitForFilledActivity(request, company.company.id);
    const filled = activity.traces.find((t) => t.outcome === 'filled')!;
    expect(filled.venue).toBe('paper_sim');
    expect(filled.mode).toBe('paper');
    const quantity = Number(filled.fills[0]?.qtyInt);
    expect(quantity).toBeGreaterThan(0);

    await page.goto(`/companies/${company.company.id}`);

    const expandInfo = page.getByRole('button', { name: /Expand info panel/ });
    if (await expandInfo.isVisible()) {
      await expandInfo.click();
    }
    await page.getByRole('button', { name: 'Executions', exact: true }).click();
    await expect(page.getByText(/paper_sim/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(new RegExp(`buy ${quantity} AAPL @ paper_sim fill`)).first(),
    ).toBeVisible();

    const expandBottom = page.getByRole('button', { name: /Expand bottom panel/ });
    if (await expandBottom.isVisible()) {
      await expandBottom.click();
    }
    await page.getByRole('button', { name: 'Decisions + traces', exact: true }).click();
    await expect(page.getByText('filled').first()).toBeVisible();
    await expect(page.getByText(/paper_sim/i).first()).toBeVisible();
  });
});
