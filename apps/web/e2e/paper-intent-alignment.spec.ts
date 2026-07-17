import type { APIRequestContext } from '@playwright/test';
import { e2eCompanyName, expect, test } from './fixtures';

type CompanyModule = {
  id: string;
  type: string;
  status: string;
};

type CompanyResponse = {
  company: {
    id: string;
    philosophyProfile: {
      version: 1;
      axes: Record<string, 'min' | 'typical' | 'max'>;
    };
  };
  modules: CompanyModule[];
};

type ActivityResponse = {
  traces: Array<{
    id: string;
    companyId: string;
    moduleId: string;
    venue: string;
    mode: string;
    outcome: string;
    fills: Array<{ qtyInt: string }>;
    simulatorGapTags: string[];
    verification: { result: string } | null;
  }>;
};

async function createPaperCompany(
  request: APIRequestContext,
  createdCompanyIds: string[],
  suffix: string,
): Promise<CompanyResponse> {
  const create = await request.post('/api/companies', {
    data: {
      name: e2eCompanyName(suffix),
      philosophyPrompt: `E2E ${suffix} paper-only intent alignment.`,
      mode: 'paper',
      seedCreditsCents: 10_000_000,
      template: 'day_trading_starter',
    },
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
  const trend = company.modules.find((module) => module.type === 'trend');
  const trading = company.modules.find((module) => module.type === 'trading');
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

async function setRiskAppetite(
  request: APIRequestContext,
  company: CompanyResponse,
  position: 'min' | 'typical' | 'max',
): Promise<void> {
  const update = await request.patch(`/api/companies/${company.company.id}`, {
    data: {
      philosophyProfile: {
        version: 1,
        axes: {
          ...company.company.philosophyProfile.axes,
          risk_appetite: position,
        },
      },
    },
  });
  expect(update.ok()).toBeTruthy();
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
    {
      data: { trendId: trend.id, targetModuleId: tradingModuleId },
    },
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
        return activity.traces.find((trace) => trace.outcome === 'filled') ?? null;
      },
      { timeout: 20_000 },
    )
    .not.toBeNull();

  const response = await request.get(`/api/companies/${companyId}/activity`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ActivityResponse;
}

test.describe('Paper intent alignment', () => {
  // Multi-company promote/dispatch cohort can exceed the default 30s under Next compile.
  test.setTimeout(90_000);

  test('persists philosophy axes and keeps live trading fail-closed', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const company = await createPaperCompany(request, createdCompanyIds, 'philosophy-ui');

    await page.goto(`/companies/${company.company.id}`);
    await page.getByRole('button', { name: 'Company ▾' }).click();
    await page.getByRole('button', { name: 'Philosophy', exact: true }).click();

    const riskAppetite = page.getByRole('combobox', { name: /Risk appetite/ });
    await riskAppetite.selectOption('max');
    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/companies/${company.company.id}`) &&
        response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Save philosophy' }).click();
    expect((await saveResponse).ok()).toBeTruthy();
    await expect(page.getByText(/Philosophy saved/)).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Company ▾' }).click();
    await page.getByRole('button', { name: 'Philosophy', exact: true }).click();
    await expect(page.getByRole('combobox', { name: /Risk appetite/ })).toHaveValue('max');

    await page.getByRole('button', { name: 'Live trading (gated)' }).click();
    await expect(page.getByText('Live trading is gated.')).toBeVisible();
    await expect(page.getByText(/Requires a connected broker, funded account/)).toBeVisible();
  });

  test('isolates conflicting company philosophies and records honest paper provenance', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const conservative = await createPaperCompany(request, createdCompanyIds, 'risk-min');
    const balanced = await createPaperCompany(request, createdCompanyIds, 'risk-typical');
    const aggressive = await createPaperCompany(request, createdCompanyIds, 'risk-max');
    const conservativeModules = await activatePipelineModules(request, conservative);
    const balancedModules = await activatePipelineModules(request, balanced);
    const aggressiveModules = await activatePipelineModules(request, aggressive);

    await setRiskAppetite(request, conservative, 'min');
    await setRiskAppetite(request, balanced, 'typical');
    await setRiskAppetite(request, aggressive, 'max');

    await promoteUpTrend(
      request,
      conservative.company.id,
      conservativeModules.trendId,
      conservativeModules.tradingId,
    );
    await promoteUpTrend(
      request,
      balanced.company.id,
      balancedModules.trendId,
      balancedModules.tradingId,
    );
    await promoteUpTrend(
      request,
      aggressive.company.id,
      aggressiveModules.trendId,
      aggressiveModules.tradingId,
    );

    const conservativeActivity = await waitForFilledActivity(request, conservative.company.id);
    const balancedActivity = await waitForFilledActivity(request, balanced.company.id);
    const aggressiveActivity = await waitForFilledActivity(request, aggressive.company.id);
    const conservativeTrace = conservativeActivity.traces.find(
      (trace) => trace.outcome === 'filled',
    )!;
    const balancedTrace = balancedActivity.traces.find((trace) => trace.outcome === 'filled')!;
    const aggressiveTrace = aggressiveActivity.traces.find((trace) => trace.outcome === 'filled')!;

    expect(
      conservativeActivity.traces.every((trace) => trace.companyId === conservative.company.id),
    ).toBeTruthy();
    expect(
      balancedActivity.traces.every((trace) => trace.companyId === balanced.company.id),
    ).toBeTruthy();
    expect(
      aggressiveActivity.traces.every((trace) => trace.companyId === aggressive.company.id),
    ).toBeTruthy();
    expect(conservativeTrace.moduleId).toBe(conservativeModules.tradingId);
    expect(balancedTrace.moduleId).toBe(balancedModules.tradingId);
    expect(aggressiveTrace.moduleId).toBe(aggressiveModules.tradingId);

    for (const trace of [conservativeTrace, balancedTrace, aggressiveTrace]) {
      expect(trace.mode).toBe('paper');
      expect(trace.venue).toBe('paper_sim');
      expect(trace.verification?.result).toBe('pass');
      expect(trace.simulatorGapTags).toEqual(
        expect.arrayContaining([
          'synthetic_quote',
          'inline_fill_model',
          'no_venue_latency',
          'no_partial_fills',
        ]),
      );
    }

    const conservativeQuantity = Number(conservativeTrace.fills[0]?.qtyInt);
    const balancedQuantity = Number(balancedTrace.fills[0]?.qtyInt);
    const aggressiveQuantity = Number(aggressiveTrace.fills[0]?.qtyInt);
    expect(conservativeQuantity).toBeGreaterThan(0);
    expect(balancedQuantity).toBeGreaterThan(conservativeQuantity);
    expect(aggressiveQuantity).toBeGreaterThan(balancedQuantity);

    // Paper v1 is fail-closed on unsupported shorts; the blocked result must
    // remain scoped to the company that submitted it.
    const blockedSell = await request.post(
      `/api/companies/${aggressive.company.id}/modules/${aggressiveModules.tradingId}/trade`,
      {
        data: {
          symbol: 'NVDA',
          actionVerb: 'sell',
          orderType: 'market',
          quantity: 1,
          limitPriceCents: null,
        },
      },
    );
    expect(blockedSell.ok()).toBeTruthy();
    await expect
      .poll(async () => {
        const response = await request.get(`/api/companies/${aggressive.company.id}/activity`);
        const activity = (await response.json()) as ActivityResponse;
        return activity.traces.find((trace) => trace.outcome === 'blocked') ?? null;
      })
      .toMatchObject({
        companyId: aggressive.company.id,
        moduleId: aggressiveModules.tradingId,
        venue: 'paper_sim',
        mode: 'paper',
        simulatorGapTags: expect.arrayContaining(['synthetic_quote', 'pre_dispatch_block']),
        verification: { result: 'blocked' },
      });

    // Flow 3 is operator-visible: the API-driven pipeline result lands in the
    // same right-panel projection used by normal canvas interaction.
    await page.goto(`/companies/${aggressive.company.id}`);
    await expect(page.getByText('Paper balance')).toBeVisible();
    await expect(
      page.getByText(new RegExp(`buy ${aggressiveQuantity} AAPL @ .* fill`)).first(),
    ).toBeVisible();
  });
});
