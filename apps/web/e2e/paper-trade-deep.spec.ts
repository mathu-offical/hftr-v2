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
  status?: string;
};

type CompanyResponse = {
  company: { id: string };
  modules: CompanyModule[];
};

async function createAndActivate(
  request: APIRequestContext,
  createdCompanyIds: string[],
): Promise<{ companyId: string; tradingId: string }> {
  const create = await request.post('/api/companies', {
    data: createCompanyApiBody(e2eCompanyName('paper-trade-deep'), {
      philosophyPrompt: 'E2E deep paper trade form + limit + preview.',
      engines: [{ templateId: 'engine_day_trading', inputs: {} }],
    }),
    timeout: 180_000,
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  const { company } = (await create.json()) as { company: { id: string } };
  createdCompanyIds.push(company.id);

  const detail = await request.get(`/api/companies/${company.id}`, { timeout: 180_000 });
  expect(detail.ok()).toBeTruthy();
  const body = (await detail.json()) as CompanyResponse;
  const { trading } = pickPaperPipelineModules(body.modules);
  expect(trading).toBeTruthy();

  const patch = await request.patch(`/api/companies/${company.id}/modules/${trading!.id}`, {
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
  });
  expect(patch.ok()).toBeTruthy();
  return { companyId: company.id, tradingId: trading!.id };
}

test.describe('Paper trade deep flows (D-192 / D-194)', () => {
  test.setTimeout(420_000);

  test('quote preview, market fill honesty chips, limit unmarketable, inspector form', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const { companyId, tradingId } = await createAndActivate(request, createdCompanyIds);

    // API: pre-trade honesty preview (MarketModel path).
    const preview = await request.get(
      `/api/companies/${companyId}/modules/${tradingId}/trade/quote-preview?symbol=AAPL&quantity=5`,
    );
    expect(preview.ok(), await preview.text()).toBeTruthy();
    const previewBody = (await preview.json()) as {
      usedLive: boolean;
      honestyTags: string[];
      impactProxyLikely: boolean;
    };
    expect(
      previewBody.honestyTags.includes('live_market_quote') ||
        previewBody.honestyTags.includes('synthetic_quote'),
    ).toBeTruthy();
    expect(previewBody.impactProxyLikely).toBe(true);

    // API: market fill → honesty chips include inline fill / no venue latency.
    const trade = await request.post(`/api/companies/${companyId}/modules/${tradingId}/trade`, {
      data: {
        symbol: 'AAPL',
        actionVerb: 'buy',
        orderType: 'market',
        quantity: 1,
        limitPriceCents: null,
      },
    });
    expect(trade.ok()).toBeTruthy();
    const activity = await waitForFilledActivity(request, companyId, { timeoutMs: 120_000 });
    const filled = activity.traces.find((t) => t.outcome === 'filled');
    expect(filled).toBeTruthy();
    let tags = filled!.simulatorGapTags ?? [];
    if (tags.length === 0) {
      const execRes = await request.get(`/api/companies/${companyId}/executions`);
      expect(execRes.ok()).toBeTruthy();
      const execBody = (await execRes.json()) as {
        executions?: Array<{ outcome?: string; simulatorGapTags?: string[] }>;
      };
      tags =
        execBody.executions?.find((e) => e.outcome === 'filled')?.simulatorGapTags ?? [];
    }
    expect(tags).toEqual(
      expect.arrayContaining(['inline_fill_model', 'no_venue_latency', 'no_queue_position']),
    );

    // API: unmarketable limit buy (limit far below mark) — assert rejected trace.
    const limitTrade = await request.post(
      `/api/companies/${companyId}/modules/${tradingId}/trade`,
      {
        data: {
          symbol: 'AAPL',
          actionVerb: 'buy',
          orderType: 'limit',
          quantity: 1,
          limitPriceCents: 1,
        },
        timeout: 60_000,
      },
    );
    expect(limitTrade.ok(), await limitTrade.text()).toBeTruthy();
    await expect
      .poll(
        async () => {
          await request.post('/api/queue/drain', { timeout: 60_000 }).catch(() => null);
          const execRes = await request.get(`/api/companies/${companyId}/executions`);
          if (!execRes.ok()) return null;
          const execBody = (await execRes.json()) as {
            executions?: Array<{ outcome?: string; failureCode?: string | null }>;
          };
          return (
            (execBody.executions ?? []).find(
              (t) =>
                t.outcome === 'rejected' ||
                t.outcome === 'blocked' ||
                t.failureCode === 'broker_policy_block',
            ) ?? null
          );
        },
        { timeout: 120_000, intervals: [500, 1_000, 2_000] },
      )
      .not.toBeNull();

    // UI: inspector PaperTradeForm preview + limit controls + honesty chips on Executions.
    await page.goto(`/companies/${companyId}`);
    const canvas = page.locator('.react-flow');
    const tradingNode = canvas
      .locator('.react-flow__node')
      .filter({ has: page.getByText('Trading', { exact: true }) })
      .first();
    await expect(tradingNode).toBeVisible({ timeout: 60_000 });
    await tradingNode.getByText('Trading', { exact: true }).click({ force: true });
    await expect(page.getByText('Paper trade')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('paper-trade-honesty-preview')).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByTestId('paper-trade-honesty-preview')).toContainText(
      /Live mark|Prior session|Synthetic|Funds-only|Impact proxy/i,
    );

    await page.getByRole('button', { name: 'limit', exact: true }).click();
    await expect(page.getByTestId('paper-trade-limit-price')).toBeVisible();
    await page.getByTestId('paper-trade-limit-price').fill('0.01');

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
      /Live mark|Synthetic|Inline fill|No queue|Funds-only|Prior session/i,
    );
  });
});
