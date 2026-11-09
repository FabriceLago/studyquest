import { defineConfig, devices } from '@playwright/test';

/** Parcours sur le build de production, comme ce qui sera déployé. Un seul navigateur à la fois : le poste a peu de mémoire libre. */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4221',
    trace: 'on-first-retry',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'bureau', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command:
        'npm run build && vite preview --outDir dist/studyquest/browser --port 4221 --strictPort',
      url: 'http://localhost:4221',
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
