import { test as base, expect, type APIRequestContext } from '@playwright/test';

/** Unique company name per test run to avoid collisions on shared dev DBs. */
export function e2eCompanyName(suffix: string): string {
  return `E2E ${suffix} ${Date.now()}`;
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
