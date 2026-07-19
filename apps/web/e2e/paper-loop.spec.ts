import type { APIRequestContext } from '@playwright/test';
import {
  createCompanyApiBody,
  e2eCompanyName,
  expect,
  pickPaperPipelineModules,
  test,
  waitForFilledActivity,
} from './fixtures';

type CompanyModule = {
  id: string;
  type: string;
  name?: string | null;
  generatedNameBase?: string | null;
  engineInstanceId?: string | null;
};

type CompanyResponse = {
  company: { id: string };
  modules: CompanyModule[];
};

async function createPaperCompany(
  request: APIRequestContext,
  createdCompanyIds: string[],
): Promise<CompanyResponse> {
  const create = await request.post('/api/companies', {
    data: createCompanyApiBody(e2eCompanyName('paper-loop'), {
      philosophyPrompt: 'E2E flow 3 — full paper promote to fill.',
    }),
    timeout: 180_000,
  });
  expect(create.ok(), `POST company failed: ${create.status()} ${await create.text()}`).toBeTruthy();
  const created = (await create.json()) as { company: { id: string } };
  createdCompanyIds.push(created.company.id);
  const detail = await request.get(`/api/companies/${created.company.id}`, {
    timeout: 180_000,
  });
  expect(detail.ok(), `GET company detail failed: ${detail.status()}`).toBeTruthy();
  return (await detail.json()) as CompanyResponse;
}

async function activatePipelineModules(
  request: APIRequestContext,
  company: CompanyResponse,
): Promise<{ trendId: string; tradingId: string }> {
  const { trend, trading } = pickPaperPipelineModules(company.modules);
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
        config: {
          subtype: 'day',
          strategyFamilies: [],
          exitTimelineDays: 1,
          cadenceMinutes: 5,
          manualControl: false,
          executionBinding: {
            routingMode: 'funds_only',
            brokerConnectionId: null,
            useProviderLedgerAsFundsSource: true,
          },
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

test.describe('Paper trading loop (flow 3)', () => {
  test.setTimeout(600_000);

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

    // Ribbon / ticker already surfaces paper fill provenance + honesty labels.
    await expect(page.getByText(/filled fee.*AAPL|buy AAPL/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('execution-honesty-ticker').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('execution-honesty-ticker').first()).toContainText(
      /Live mark|Prior session|Synthetic|Funds-only|No queue/i,
    );

    // Expand right info panel (default tab = Executions). Do not re-click Executions —
    // active-tab re-click collapses the panel.
    const expandInfo = page.getByRole('button', { name: /Expand info panel/ });
    if (await expandInfo.isVisible()) {
      await expandInfo.click();
    }
    await expect(page.getByTestId('right-panel-paper-balance')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('right-panel-loading')).toBeHidden({ timeout: 90_000 });
    await expect
      .poll(async () => page.getByTestId('execution-honesty-chips').count(), {
        timeout: 90_000,
        intervals: [500, 1_000, 2_000],
      })
      .toBeGreaterThan(0);
    await expect(page.getByTestId('execution-honesty-chips').first()).toContainText(
      /Live mark|Prior session|Synthetic|Funds-only|No queue/i,
    );

    const expandBottom = page.getByRole('button', { name: /Expand bottom panel/ });
    if (await expandBottom.isVisible()) {
      await expandBottom.click();
    }
    await page.getByRole('button', { name: /Decisions \+ traces/ }).click();
    await expect
      .poll(async () => page.getByTestId('decisions-honesty-chips').count(), {
        timeout: 60_000,
        intervals: [500, 1_000, 2_000],
      })
      .toBeGreaterThan(0);
  });
});
