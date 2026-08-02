import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build (`npm run build` first).
 * The mobile project mirrors the primary target device: a narrow iPhone.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    // Allows pointing at a system Chromium when the Playwright-managed
    // download is unavailable (e.g. sandboxed environments).
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
    /**
     * The primary target is an iPhone, and "iPhone 13" above is a Chromium
     * running at iPhone dimensions — it shares nothing with Safari's engine.
     * This project runs the same specs on WebKit, which is what the app has
     * to work in. Selected explicitly (`--project=webkit-mobile`) so the
     * default run stays fast; CI runs it as its own step.
     */
    {
      name: "webkit-mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" },
    },
  ],
  webServer: {
    command: "npm run start -- -p 3100 -H 127.0.0.1",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Keep sync-server records out of the repo's default ./data location.
    env: { SYNC_DATA_DIR: ".sync-test-data" },
  },
});
