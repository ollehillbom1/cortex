import { devices, expect, test } from "@playwright/test";
import { advanceToProfileForm, createProfile } from "./helpers";

/**
 * Two-device sync (issue #2): each browser context has its own IndexedDB, so
 * a second context behaves exactly like a second device talking to the same
 * self-hosted server. The passphrase is unique per run so parallel or
 * repeated runs never share a sync group.
 */
test.describe("device sync", () => {
  test("restores on a second device and merges changes both ways", async ({ page, browser }) => {
    const passphrase = `e2e sync ${Date.now()}`;

    // Device A: onboard and enable sync from the profile page.
    await createProfile(page, "Anna");
    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Enable sync", exact: true }).click();
    const enableDialog = page.getByRole("dialog");
    await enableDialog.getByLabel("Sync passphrase").fill(passphrase);
    await enableDialog.getByRole("button", { name: "Enable sync", exact: true }).click();
    await expect(page.getByText(/sync is on/i)).toBeVisible({ timeout: 20_000 });

    // Device B: fresh context, restore instead of creating a profile.
    const deviceB = await browser.newContext({ ...devices["iPhone 13"] });
    const pageB = await deviceB.newPage();
    await advanceToProfileForm(pageB);
    await pageB.getByRole("button", { name: /restore from sync/i }).click();
    const restoreDialog = pageB.getByRole("dialog");
    await restoreDialog.getByLabel("Sync passphrase").fill(passphrase);
    await restoreDialog.getByRole("button", { name: "Restore", exact: true }).click();
    await pageB.waitForURL(/\/$/, { timeout: 20_000 });

    // Anna's profile arrived on device B.
    await pageB.getByRole("link", { name: "Profile", exact: true }).click();
    await expect(pageB.getByRole("heading", { name: "Anna" })).toBeVisible();

    // Device B adds a household profile and pushes it.
    await pageB.getByRole("button", { name: /add household profile/i }).click();
    await pageB.getByPlaceholder("e.g. Alex").fill("Bertil");
    await pageB.getByRole("button", { name: "Create", exact: true }).click();
    await expect(pageB.getByRole("heading", { name: "Bertil" })).toBeVisible();
    await pageB.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(pageB.getByText("Synced.", { exact: true })).toBeVisible({ timeout: 20_000 });

    // Device A pulls and now sees Bertil too.
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(page.getByText("Synced.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Bertil/ })).toBeVisible();

    await deviceB.close();
  });

  test("a wrong passphrase restores nothing and leaves sync off", async ({ browser }) => {
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await context.newPage();
    await advanceToProfileForm(page);
    await page.getByRole("button", { name: /restore from sync/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Sync passphrase").fill(`nobody uses this ${Date.now()}`);
    await dialog.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(dialog.getByText(/no data found/i)).toBeVisible({ timeout: 20_000 });
    await context.close();
  });
});
