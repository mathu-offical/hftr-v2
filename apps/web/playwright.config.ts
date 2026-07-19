import { defineConfig, devices } from '@playwright/test';

const port = 3001;
const baseURL = `http://127.0.0.1:${port}`;

/**
 * E2E against the Next dev server with Clerk cleared and DEV_AUTH_BYPASS=1.
 * DATABASE_URL comes from the environment (apps/web/.env.local locally, CI
 * service Postgres in the optional e2e workflow job).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `PORT=${port} NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= CLERK_SECRET_KEY= DEV_AUTH_BYPASS=1 pnpm dev`,
    url: baseURL,
    // Cursor agent shells often set CI=1; still reuse a developer Next on :3001.
    reuseExistingServer: process.env.PW_FORCE_WEB_SERVER !== '1',
    timeout: 120_000,
  },
});
