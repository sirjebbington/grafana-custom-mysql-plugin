import { defineConfig, devices } from '@playwright/test';

// Browser tests against the local stack (scripts/e2e.sh up). See scripts/e2e.sh test for running them in
// the Playwright Docker image when the host lacks Chromium's system libraries.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.GRAFANA_URL ?? 'http://localhost:23000',
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } } }],
});
