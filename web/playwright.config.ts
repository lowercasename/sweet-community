import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright tests in a real browser (architecture.md, Testing). Three servers:
 * the built binary on a fresh database, the Vite dev server in front of it
 * (because Raphael uses dev mode, with React StrictMode and hot reload), and
 * a new instance with no owner, used only by the setup test. Four projects:
 * built desktop, built phone, dev desktop, and fresh for the test tagged @fresh.
 */
const BUILT = 'http://127.0.0.1:8098'
const DEV = 'http://127.0.0.1:5199'
const FRESH = 'http://127.0.0.1:8097'

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // One worker: the login limiter is per address, and the stream tests
  // watch for specific events.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'sh e2e/serve.sh',
      url: BUILT + '/healthz',
      timeout: 240_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'pnpm exec vite --config e2e/vite.config.ts',
      url: DEV,
      timeout: 60_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'sh e2e/serve-fresh.sh',
      url: FRESH + '/healthz',
      timeout: 240_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
  projects: [
    { name: 'built', use: { ...devices['Desktop Chrome'], baseURL: BUILT }, grepInvert: /@phone|@fresh/ },
    // A phone-sized Chromium: WebKit is not installed, and the layout is what matters here.
    { name: 'phone', use: { ...devices['Pixel 7'], baseURL: BUILT }, grep: /@phone/ },
    { name: 'dev', use: { ...devices['Desktop Chrome'], baseURL: DEV }, grepInvert: /@phone|@fresh/ },
    // The instance that has never been set up: one flow, once.
    { name: 'fresh', use: { ...devices['Desktop Chrome'], baseURL: FRESH }, grep: /@fresh/ },
  ],
})
