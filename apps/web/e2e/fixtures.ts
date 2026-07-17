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
 * Selects a template and opens the canvas. Blank has no setup fields — uses Create only.
 * Seeded templates with required setup expose Skip setup & open canvas.
 */
export async function createCompanyFromTemplate(
  page: Page,
  templateButton: RegExp | string,
  options?: { skipSetup?: boolean },
): Promise<void> {
  await page.getByRole('button', { name: templateButton }).click();
  const skip = page.getByRole('button', { name: 'Skip setup & open canvas' });
  const create = page.getByRole('button', { name: 'Create (paper mode)' });
  // Both buttons can be in the DOM (Create may be disabled) — never assert .or() without .first().
  if (options?.skipSetup === false) {
    await expect(create).toBeVisible({ timeout: CREATE_FORM_TIMEOUT_MS });
    await create.click();
  } else {
    await expect(skip).toBeVisible({ timeout: CREATE_FORM_TIMEOUT_MS });
    await skip.click();
  }
  await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/, { timeout: CREATE_FORM_TIMEOUT_MS });
}

/** Company create form name field (avoids colliding with company-list aria-labels). */
export function companyNameField(page: Page) {
  return page.getByRole('textbox', { name: 'Name', exact: true });
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
