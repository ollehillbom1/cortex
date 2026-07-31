import { expect, test } from "@playwright/test";
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

  test("app starts offline after the first visit", async ({ page, context }) => {
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
