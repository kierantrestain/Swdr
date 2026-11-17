import { defineConfig } from '@playwright/test';

const port = '4173';
const baseURL = process.env.SWDR_BROWSER_URL ?? `http://127.0.0.1:${port}`;
const staticDist = process.env.SWDR_BROWSER_DIST;
const executablePath = process.env.SWDR_CHROMIUM;
const restrictedBrowser = process.env.SWDR_RESTRICTED_BROWSER === '1';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 7_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    actionTimeout: 10_000,
    viewport: { width: 1440, height: 900 },
    browserName: 'chromium',
    serviceWorkers: staticDist ? 'block' : 'allow',
    launchOptions: {
      executablePath,
      args: restrictedBrowser ? ['--single-process', '--disable-gpu', '--disable-software-rasterizer', '--no-zygote'] : []
    },
    trace: 'retain-on-failure'
  },
  webServer: staticDist || process.env.SWDR_BROWSER_URL ? undefined : {
    command: `npm run build && npm exec vite -- preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000
  }
});
