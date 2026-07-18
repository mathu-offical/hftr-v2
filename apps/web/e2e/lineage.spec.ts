import type { APIRequestContext } from '@playwright/test';
import { createCompanyApiBody, e2eCompanyName, expect, test } from './fixtures';

type CompanyModule = { id: string; type: string };

type CompanyResponse = {
  company: { id: string };
  modules: CompanyModule[];
};

type ValueRow = {
  ref: string;
  sourceClass: string;
  parentRefs?: string[] | null;
};

type LineageResponse = {
  rootRef: string;
  chain: Array<{ ref: string; sourceClass: string; depth: number }>;
  truncated: boolean;
};

const ROOTISH = new Set([
  'live_feed',
  'synthetic_sim',
  'broker_state',
  'ledger',
  'clock',
  'calendar',
  'band_seed',
  'operator_input',
  'derived',
]);

async function createPaperCompany(
  request: APIRequestContext,
  createdCompanyIds: string[],
): Promise<CompanyResponse> {
  const create = await request.post('/api/companies', {
    data: createCompanyApiBody(e2eCompanyName('lineage'), {
      philosophyPrompt: 'E2E flow 7 — ValueRef lineage audit.',
    }),
  });
  expect(create.ok()).toBeTruthy();
  const created = (await create.json()) as { company: { id: string } };
  createdCompanyIds.push(created.company.id);
  const detail = await request.get(`/api/companies/${created.company.id}`);
  expect(detail.ok()).toBeTruthy();
  return (await detail.json()) as CompanyResponse;
}

async function activateAndPromote(
  request: APIRequestContext,
  company: CompanyResponse,
): Promise<void> {
  const trend = company.modules.find((m) => m.type === 'trend');
  const trading = company.modules.find((m) => m.type === 'trading');
  expect(trend).toBeTruthy();
  expect(trading).toBeTruthy();

  await request.patch(`/api/companies/${company.company.id}/modules/${trend!.id}`, {
    data: { status: 'active', setup: { topicSectors: ['Large-cap technology'] } },
  });
  await request.patch(`/api/companies/${company.company.id}/modules/${trading!.id}`, {
    data: {
      status: 'active',
      setup: {
        topicSectors: ['Large-cap technology'],
        capitalAllocation: { mode: 'percentage', value: '25' },
        targetExitAt: '2099-01-02T15:30:00.000Z',
        timezone: 'America/New_York',
      },
    },
  });

  const trendResponse = await request.post(`/api/companies/${company.company.id}/trends`, {
    data: {
      moduleId: trend!.id,
      symbol: 'AAPL',
      direction: 'up',
      strengthBand: 'strong',
    },
  });
  expect(trendResponse.ok()).toBeTruthy();
  const { trend: trendRow } = (await trendResponse.json()) as { trend: { id: string } };

  const promote = await request.post(
    `/api/companies/${company.company.id}/modules/${trend!.id}/promote`,
    { data: { trendId: trendRow.id, targetModuleId: trading!.id } },
  );
  expect(promote.ok()).toBeTruthy();

  await expect
    .poll(
      async () => {
        const activity = await request.get(`/api/companies/${company.company.id}/activity`);
        if (!activity.ok()) return null;
        const body = (await activity.json()) as { traces: Array<{ outcome: string }> };
        return body.traces.find((t) => t.outcome === 'filled') ?? null;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();
}

test.describe('Value lineage (flow 7)', () => {
  test.setTimeout(90_000);

  test('walks ValueRef lineage after paper fill and exposes Values tab', async ({
    page,
    request,
    createdCompanyIds,
  }) => {
    const company = await createPaperCompany(request, createdCompanyIds);
    await activateAndPromote(request, company);

    const valuesResponse = await request.get(`/api/companies/${company.company.id}/values`);
    expect(valuesResponse.ok()).toBeTruthy();
    const { values } = (await valuesResponse.json()) as { values: ValueRow[] };
    expect(values.length).toBeGreaterThan(0);

    const withLineage = values.find((v) => (v.parentRefs?.length ?? 0) > 0) ?? values[0]!;
    const lineageResponse = await request.get(
      `/api/companies/${company.company.id}/values/${encodeURIComponent(withLineage.ref)}/lineage`,
    );
    expect(lineageResponse.ok()).toBeTruthy();
    const lineage = (await lineageResponse.json()) as LineageResponse;
    expect(lineage.chain.length).toBeGreaterThan(0);
    expect(lineage.chain.some((node) => ROOTISH.has(node.sourceClass))).toBeTruthy();

    await page.goto(`/companies/${company.company.id}`);
    const expandInfo = page.getByRole('button', { name: /Expand info panel/ });
    if (await expandInfo.isVisible()) {
      await expandInfo.click();
    }
    await page.getByRole('button', { name: 'Values', exact: true }).click();
    await expect(page.getByText('No recorded values yet')).toHaveCount(0);
    await page
      .getByRole('button', { name: /Show lineage for value/ })
      .first()
      .click();
    await expect(page.getByText('Lineage chain')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/depth 0/)).toBeVisible();
  });
});
