import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  globalSetup: './tests/e2e/global-setup.mjs',
  globalTeardown: './tests/e2e/global-teardown.mjs',
  reporter: [['list'], ['json', { outputFile: 'artifacts/e2e/results.json' }], ['html', { outputFolder: 'artifacts/e2e/report', open: 'never' }]],
  outputDir: 'artifacts/e2e/test-results',
  use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: true, timeout: 30000 },
})
