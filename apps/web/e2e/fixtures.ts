import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

/** Unique company name per test run to avoid collisions on shared dev DBs. */
export function e2eCompanyName(suffix: string): string {
  return `E2E ${suffix} ${Date.now()}`;
}

/** Cold Next compile can delay the create form — wait for template + action buttons. */
export const CREATE_FORM_TIMEOUT_MS = 60_000;

/** Opens the new-company form from the companies directory. */
export async function openNewCompanyForm(page: Page): Promise<void> {
  await page.goto('/companies');
  await page.getByRole('button', { name: 'New company' }).click();
  await expect(page.getByRole('heading', { name: 'New company' })).toBeVisible({
    timeout: CREATE_FORM_TIMEOUT_MS,
  });
}

/**
 * Adds a day-trading execution engine (auto-seeds research deps) and opens canvas.
 * Prefer skipSetup (default) so topic can be completed on-canvas.
 */
export async function createCompanyFromTemplate(
  page: Page,
  _templateButton?: RegExp | string,
  options?: { skipSetup?: boolean },
): Promise<void> {
  const summary = page.getByTestId('create-identity-summary');
  if (await summary.isVisible()) {
    await summary.click();
  }
  const nameField = page.getByRole('textbox', { name: /Name/ });
  if (!(await nameField.inputValue()).trim()) {
    await nameField.fill(e2eCompanyName('from-template'));
  }
  const philosophy = page.getByRole('textbox', { name: /Philosophy/ });
  if (!(await philosophy.inputValue()).trim()) {
    await philosophy.fill('E2E day-trading company philosophy.');
  }
  await page.getByRole('button', { name: 'Open execution store' }).click();
  await page.getByRole('button', { name: 'Add Day trading engine' }).click();
  await expect(page.getByTestId('engine-seed-card').first()).toBeVisible({
    timeout: CREATE_FORM_TIMEOUT_MS,
  });
  const skip = page.getByRole('button', { name: 'Skip setup & open canvas' });
  const create = page.getByRole('button', { name: 'Create (paper mode)' });
  if (options?.skipSetup === false) {
    await expect(create).toBeEnabled({ timeout: CREATE_FORM_TIMEOUT_MS });
    await create.click();
  } else {
    await expect(skip).toBeEnabled({ timeout: CREATE_FORM_TIMEOUT_MS });
    await skip.click();
  }
  await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/, { timeout: CREATE_FORM_TIMEOUT_MS });
}

/** Company create form name field (avoids colliding with company-list aria-labels). */
export function companyNameField(page: Page) {
  return page
    .getByRole('dialog', { name: 'New company' })
    .getByRole('textbox', { name: /Name/ });
}

/**
 * API body for POST /api/companies (D-043): always includes ≥1 engine.
 * Defaults to day-trading execution engine; callers may override `engines`.
 */
export function createCompanyApiBody(
  name: string,
  overrides?: {
    philosophyPrompt?: string;
    seedCreditsCents?: number;
    engines?: Array<{
      templateId: string;
      inputs?: Record<string, string>;
      setup?: unknown;
    }>;
    extraModules?: unknown[];
  },
) {
  return {
    name,
    philosophyPrompt: overrides?.philosophyPrompt ?? 'E2E paper company philosophy.',
    mode: 'paper' as const,
    seedCreditsCents: overrides?.seedCreditsCents ?? 1_000_000,
    engines: overrides?.engines ?? [{ templateId: 'engine_day_trading', inputs: {} }],
    extraModules: overrides?.extraModules,
  };
}

/** Activity shape used by paper promote → fill polls. */
export type PaperActivityResponse = {
  traces: Array<{
    id?: string;
    companyId?: string;
    moduleId?: string;
    venue: string;
    mode: string;
    outcome: string;
    fills: Array<{ qtyInt: string }>;
    simulatorGapTags?: string[];
    verification?: { result: string } | null;
  }>;
};

export type PipelineModuleRow = {
  id: string;
  type: string;
  name?: string | null;
  generatedNameBase?: string | null;
  engineInstanceId?: string | null;
  config?: Record<string, unknown>;
};

/**
 * Prefer the day-trading execution desk over D-189 sim-child trading/trend modules.
 */
export function pickPaperPipelineModules(modules: PipelineModuleRow[]): {
  trading: PipelineModuleRow | undefined;
  trend: PipelineModuleRow | undefined;
} {
  const labelOf = (m: PipelineModuleRow) => `${m.name ?? ''} ${m.generatedNameBase ?? ''}`;
  const isSimChild = (m: PipelineModuleRow) =>
    /gate|training|adhoc|\bsim\b/i.test(labelOf(m));

  const tradings = modules.filter((m) => m.type === 'trading');
  const trading =
    tradings.find((m) => /day[- ]?trade/i.test(labelOf(m))) ??
    tradings.find((m) => !isSimChild(m)) ??
    tradings[0];

  const trends = modules.filter((m) => m.type === 'trend');
  const trend =
    (trading?.engineInstanceId
      ? trends.find((m) => m.engineInstanceId === trading.engineInstanceId)
      : undefined) ??
    trends.find((m) => !isSimChild(m)) ??
    trends[0];

  return { trading, trend };
}

/**
 * Poll activity ∪ executions until a filled paper trace appears.
 * Re-drains the queue each tick so time-spaced POV child-slice jobs (D-129)
 * can complete when `run_after` elapses (DEV_AUTH_BYPASS POST /api/queue/drain).
 */
export async function waitForFilledActivity(
  request: APIRequestContext,
  companyId: string,
  options?: { timeoutMs?: number },
): Promise<PaperActivityResponse> {
  const timeoutMs = options?.timeoutMs ?? 300_000;
  await expect
    .poll(
      async () => {
        const [activityRes, execRes] = await Promise.all([
          request.get(`/api/companies/${companyId}/activity`),
          request.get(`/api/companies/${companyId}/executions`),
        ]);
        if (activityRes.ok()) {
          const activity = (await activityRes.json()) as PaperActivityResponse;
          const filled = activity.traces.find((trace) => trace.outcome === 'filled');
          if (filled) return filled;
        }
        if (execRes.ok()) {
          const body = (await execRes.json()) as {
            executions?: Array<{ outcome?: string }>;
          };
          const filled = (body.executions ?? []).find((row) => row.outcome === 'filled');
          if (filled) return filled;
        }
        await request.post('/api/queue/drain').catch(() => null);
        return null;
      },
      { timeout: timeoutMs, intervals: [250, 500, 1_000, 2_000] },
    )
    .not.toBeNull();

  const response = await request.get(`/api/companies/${companyId}/activity`);
  expect(response.ok()).toBeTruthy();
  const activity = (await response.json()) as PaperActivityResponse;
  if (activity.traces.some((t) => t.outcome === 'filled')) return activity;

  // Activity can lag executions — synthesize a minimal filled trace list for callers.
  const execRes = await request.get(`/api/companies/${companyId}/executions`);
  expect(execRes.ok()).toBeTruthy();
  const execBody = (await execRes.json()) as {
    executions?: PaperActivityResponse['traces'];
  };
  return {
    traces: [...activity.traces, ...((execBody.executions as PaperActivityResponse['traces']) ?? [])],
  };
}

type CompanyFixtures = {
  createdCompanyIds: string[];
};

/**
 * Tracks companies created during a test so they can be archived via DELETE
 * even when the test body throws.
 */
export const test = base.extend<CompanyFixtures>({
  createdCompanyIds: async ({ request }, use) => {
    const ids: string[] = [];
    await use(ids);
    for (const id of ids) {
      await request.delete(`/api/companies/${id}`).catch(() => undefined);
    }
  },
});

export { expect };

export async function archiveCompany(request: APIRequestContext, id: string) {
  const res = await request.delete(`/api/companies/${id}`);
  expect(res.ok()).toBeTruthy();
}
