import { defineConfig, devices } from '@playwright/test';

/** Headed + slowMo walkthrough for operator viewing. */
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'live-demo-watch.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 180_000,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    headless: false,
    viewport: { width: 1440, height: 900 },
    launchOptions: { slowMo: 700 },
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], headless: false } }],
});
