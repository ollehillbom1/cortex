import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build (`npm run build` first).
 * The mobile project mirrors the primary target device: a narrow iPhone.
 */
const E2E_PORT = process.env.E2E_PORT ?? "3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
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
     * to work in.
     *
     * Opt-in via E2E_WEBKIT=1 rather than always present: WebKit needs three
     * system libraries this project does not require, so listing it
     * unconditionally made the ordinary `npx playwright test` fail for
     * everyone who has not installed them. CI sets the variable for its own
     * step.
     */
    ...(process.env.E2E_WEBKIT
      ? [
          {
            name: "webkit-mobile",
            use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" as const },
          },
        ]
      : []),
  ],
  webServer: {
    command: `npm run start -- -p ${E2E_PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${E2E_PORT}`,
    // Never reuse. A fixed port plus reuse means a run can silently attach to
    // a server started from a DIFFERENT checkout — a reviewer got a complete
    // fabrication that way, showing a fix failing when it worked. An e2e
    // result that might describe another worktree's build is worse than no
    // result. Override the port with E2E_PORT to run two suites at once.
    reuseExistingServer: false,
    timeout: 60_000,
    // Keep sync-server records out of the repo's default ./data location.
    env: { SYNC_DATA_DIR: ".sync-test-data" },
  },
});
