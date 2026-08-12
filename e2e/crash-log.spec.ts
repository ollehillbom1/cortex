import { expect, test } from "./fixtures";
import { createProfile } from "./helpers";

/**
 * The local crash log: an uncaught error is recorded on-device and shown
 * under Profile → Diagnostics, then clearable. No telemetry — this is the
 * only path a household bug reaches anyone, so it has to actually capture.
 */
test("an uncaught error is recorded and shown under Diagnostics, then clears", async ({ page }) => {
  await createProfile(page, "Crash");

  // Diagnostics is hidden until something goes wrong.
  await page.goto("/profile");
  await expect(page.getByRole("region", { name: "Diagnostics" })).toHaveCount(0);

  // Provoke a genuine uncaught error + an unhandled rejection, the two the
  // CrashCatcher listens for. Seed the log directly through the same code
  // path the app uses, so the assertion does not depend on error timing.
  await page.evaluate(async () => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Synthetic boom",
        error: new Error("Synthetic boom"),
        filename: "test",
      }),
    );
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.reject(new Error("Synthetic reject")).catch(() => {}),
        reason: new Error("Synthetic reject"),
      }),
    );
  });

  // The write is async; reload and the section appears.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const req = indexedDB.open("cortex");
              req.onsuccess = () => {
                const get = req.result.transaction("meta").objectStore("meta").get("crashLog");
                get.onsuccess = () => {
                  try {
                    resolve(JSON.parse(get.result?.value ?? "[]").length);
                  } catch {
                    resolve(0);
                  }
                };
                get.onerror = () => resolve(0);
              };
              req.onerror = () => resolve(0);
            }),
        ),
      { timeout: 5000 },
    )
    .toBeGreaterThanOrEqual(1);

  await page.goto("/profile");
  const diagnostics = page.getByRole("region", { name: "Diagnostics" });
  await expect(diagnostics).toBeVisible();
  // The rejection's reason.message survives a synthetic dispatch reliably
  // (a synthetic ErrorEvent's .message does not, across engines) — either
  // way the point is that a captured crash is shown here verbatim.
  await expect(diagnostics.getByText(/Synthetic reject/)).toBeVisible();

  // Clearing empties it and hides the section on the next visit.
  await diagnostics.getByRole("button", { name: /^clear$/i }).click();
  await page.goto("/profile");
  await expect(page.getByRole("region", { name: "Diagnostics" })).toHaveCount(0);
});
