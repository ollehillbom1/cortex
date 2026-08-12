import { expect, test } from "./fixtures";
import { createProfile } from "./helpers";

test.describe("offline PWA", () => {
  test("manifest and service worker are served", async ({ page, request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBeTruthy();
    const body = await manifest.json();
    expect(body.display).toBe("standalone");

    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBeTruthy();
    expect(sw.headers()["cache-control"]).toContain("no-cache");
    await page.goto("/");
  });

  test("starts offline from a genuinely cold cache", async ({ page, context, browserName }) => {
    /**
     * Chromium-only, and not because the feature is. Playwright cannot
     * simulate an outage on WebKit that a service worker can answer:
     * `context.setOffline(true)` and `route.abort()` both cut the navigation
     * ABOVE the worker, so a cache hit that never touches the network fails
     * anyway ("WebKit encountered an internal error" and "Blocked by Web
     * Inspector" respectively).
     *
     * The behaviour was verified on WebKit by killing the server outright
     * (2026-08-02): the worker registered, took control, cached 27 entries
     * including the shell, and navigation with the server down rendered from
     * cache. This records a limitation of the harness, not an untested
     * platform — so do not read a green WebKit run as covering offline start.
     */
    test.skip(
      browserName === "webkit",
      "Playwright cuts the network above the service worker on WebKit; verified by a real outage instead.",
    );

    // The existing offline test visits every route first, which pre-warms the
    // runtime cache and hides the real gap: with the browser's HTTP cache
    // cleared, the install step had cached HTML routes but no build assets,
    // so a cold start rendered a bare tab bar. CacheStorage and IndexedDB are
    // deliberately kept — that is what a reopened PWA has.
    await createProfile(page, "Kall");
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
            once: true,
          });
          registration.active?.postMessage({ type: "SKIP_WAITING" });
        });
      }
    });
    // Give the install-time asset sweep time to finish.
    await page.waitForTimeout(1500);

    // Chromium-only API, and there is no portable equivalent: clearing the
    // HTTP cache is the whole point of this test, since the install step used
    // to cache HTML routes but no build assets and a warm HTTP cache hid it.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.clearBrowserCache");

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole("heading", { name: "Today's training" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Kall/)).toBeVisible();
    await context.setOffline(false);
  });

  test("app starts offline after the first visit", async ({ page, context, browserName }) => {
    /**
     * Chromium-only, and not because the feature is. Playwright cannot
     * simulate an outage on WebKit that a service worker can answer:
     * `context.setOffline(true)` and `route.abort()` both cut the navigation
     * ABOVE the worker, so a cache hit that never touches the network fails
     * anyway ("WebKit encountered an internal error" and "Blocked by Web
     * Inspector" respectively).
     *
     * The behaviour was verified on WebKit by killing the server outright
     * (2026-08-02): the worker registered, took control, cached 27 entries
     * including the shell, and navigation with the server down rendered from
     * cache. This records a limitation of the harness, not an untested
     * platform — so do not read a green WebKit run as covering offline start.
     */
    test.skip(
      browserName === "webkit",
      "Playwright cuts the network above the service worker on WebKit; verified by a real outage instead.",
    );

    await createProfile(page, "Offliner");

    // Wait until the service worker controls the page and caches settle.
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
            once: true,
          });
          registration.active?.postMessage({ type: "SKIP_WAITING" });
        });
      }
    });
    // Visit the pages we expect to work offline so they are runtime-cached.
    await page.goto("/exercises");
    await page.goto("/");
    await page.waitForTimeout(500);

    await context.setOffline(true);
    await page.reload();

    // The shell and data (IndexedDB) are fully available offline.
    await expect(page.getByRole("heading", { name: "Today's training" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Offliner/)).toBeVisible();
    await context.setOffline(false);
  });
});
