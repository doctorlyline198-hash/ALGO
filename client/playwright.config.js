import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  expect: {
    timeout: 15000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      command: 'npm run start',
      cwd: '../server',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      stderr: 'pipe'
    },
    {
      command: 'npm run dev -- --host --port 4173 --strictPort',
      cwd: '.',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      stderr: 'pipe'
    }
  ]
});
