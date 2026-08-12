import { devices, expect, test, type Page } from "./fixtures";
import { advanceToProfileForm, createProfile } from "./helpers";

/**
 * Two-device sync on the v3 protocol: each browser context has its own
 * IndexedDB, so a second context behaves exactly like a second device talking
 * to the same self-hosted server. Every run creates its group from a fresh
 * random sync code, so parallel or repeated runs never share a group.
 */

/** Enable sync on the profile page and walk the mandatory save-code step. */
async function setUpSyncAndSaveCode(page: Page): Promise<string> {
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Set up sync on this device" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Your sync code")).toBeVisible({ timeout: 20_000 });
  const code = (await dialog.getByTestId("sync-code").textContent())!.trim();
  expect(code).toMatch(/^C3-/);
  await dialog.getByRole("button", { name: "I have saved my sync code" }).click();
  await expect(page.getByText(/sync is on/i)).toBeVisible();
  return code;
}

test.describe("device sync", () => {
  test("a reinstalled device can restore with the sync code from the first screen", async ({
    page,
    browser,
  }) => {
    // Reported from real use: after deleting and re-adding the app, there was
    // no obvious way to sync again. The restore entry existed only on the
    // LAST onboarding step, below "Start training" — so the obvious path
    // created an empty profile and left the history apparently gone.
    await createProfile(page, "Dagny");
    const code = await setUpSyncAndSaveCode(page);

    // A freshly installed device: the very first screen must offer it.
    const fresh = await browser.newContext({ ...devices["iPhone 13"] });
    const freshPage = await fresh.newPage();
    await freshPage.goto("/welcome");
    await freshPage.getByRole("button", { name: /restore from sync/i }).click();
    const restoreDialog = freshPage.getByRole("dialog");
    await restoreDialog.getByLabel("Sync code or passphrase").fill(code);
    await restoreDialog.getByRole("button", { name: "Restore", exact: true }).click();
    await freshPage.waitForURL(/\/$/, { timeout: 20_000 });

    await freshPage.getByRole("link", { name: "Profile", exact: true }).click();
    await expect(freshPage.getByRole("heading", { name: "Dagny" })).toBeVisible();

    // The code stays available for the NEXT device: this one can show it.
    await expect(freshPage.getByRole("button", { name: "Show sync code" })).toBeVisible();
    await fresh.close();
  });

  test("restores on a second device and merges changes both ways", async ({ page, browser }) => {
    // Device A: onboard and enable sync from the profile page.
    await createProfile(page, "Anna");
    const code = await setUpSyncAndSaveCode(page);

    // Device B: fresh context, restore instead of creating a profile.
    const deviceB = await browser.newContext({ ...devices["iPhone 13"] });
    const pageB = await deviceB.newPage();
    await advanceToProfileForm(pageB);
    await pageB.getByRole("button", { name: /restore from sync/i }).click();
    const restoreDialog = pageB.getByRole("dialog");
    await restoreDialog.getByLabel("Sync code or passphrase").fill(code);
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

  test("the lost-device flow makes the old code worthless and the new one whole", async ({
    page,
    browser,
  }) => {
    await createProfile(page, "Frida");
    const oldCode = await setUpSyncAndSaveCode(page);

    // The device registry shows this device, inside the household's data.
    await expect(page.getByRole("list", { name: /devices in this sync group/i })).toBeVisible();
    await expect(page.getByText(/this device — rename/i)).toBeVisible();

    await page.getByRole("button", { name: "Lost a device?" }).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText(/cannot be taken back/i)).toBeVisible();
    await confirm.getByRole("button", { name: "Create a new code", exact: true }).click();

    const codeDialog = page.getByRole("dialog");
    await expect(codeDialog.getByText("Your sync code")).toBeVisible({ timeout: 20_000 });
    const newCode = (await codeDialog.getByTestId("sync-code").textContent())!.trim();
    expect(newCode).not.toBe(oldCode);
    await codeDialog.getByRole("button", { name: "I have saved my sync code" }).click();
    await expect(page.getByText(/old code no longer unlocks anything/i)).toBeVisible();

    // The lost phone's code now restores nothing...
    const thief = await browser.newContext({ ...devices["iPhone 13"] });
    const thiefPage = await thief.newPage();
    await thiefPage.goto("/welcome");
    await thiefPage.getByRole("button", { name: /restore from sync/i }).click();
    const thiefDialog = thiefPage.getByRole("dialog");
    await thiefDialog.getByLabel("Sync code or passphrase").fill(oldCode);
    await thiefDialog.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(thiefDialog.getByText(/no data found/i)).toBeVisible({ timeout: 20_000 });
    await thief.close();

    // ...while the household continues under the new one.
    const family = await browser.newContext({ ...devices["iPhone 13"] });
    const familyPage = await family.newPage();
    await familyPage.goto("/welcome");
    await familyPage.getByRole("button", { name: /restore from sync/i }).click();
    const familyDialog = familyPage.getByRole("dialog");
    await familyDialog.getByLabel("Sync code or passphrase").fill(newCode);
    await familyDialog.getByRole("button", { name: "Restore", exact: true }).click();
    await familyPage.waitForURL(/\/$/, { timeout: 20_000 });
    await familyPage.getByRole("link", { name: "Profile", exact: true }).click();
    await expect(familyPage.getByRole("heading", { name: "Frida" })).toBeVisible();
    await family.close();
  });

  test("deleting the server copy makes restore impossible, and touches nothing local", async ({
    page,
    browser,
  }) => {
    await createProfile(page, "Elvira");
    const code = await setUpSyncAndSaveCode(page);

    await page.getByRole("button", { name: "Delete server copy…" }).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText(/no device can restore/i)).toBeVisible();
    await confirm.getByRole("button", { name: "Delete server copy", exact: true }).click();
    await expect(page.getByText(/server copy deleted/i)).toBeVisible({ timeout: 20_000 });

    // Local data is untouched, sync is off.
    await expect(page.getByRole("heading", { name: "Elvira" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Set up sync on this device" })).toBeVisible();

    // The code that used to restore now finds nothing — the copy is gone.
    const fresh = await browser.newContext({ ...devices["iPhone 13"] });
    const freshPage = await fresh.newPage();
    await freshPage.goto("/welcome");
    await freshPage.getByRole("button", { name: /restore from sync/i }).click();
    const restoreDialog = freshPage.getByRole("dialog");
    await restoreDialog.getByLabel("Sync code or passphrase").fill(code);
    await restoreDialog.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(restoreDialog.getByText(/no data found/i)).toBeVisible({ timeout: 20_000 });
    await fresh.close();
  });

  test("a wrong passphrase restores nothing and leaves sync off", async ({ browser }) => {
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await context.newPage();
    await advanceToProfileForm(page);
    await page.getByRole("button", { name: /restore from sync/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Sync code or passphrase").fill(`nobody uses this ${Date.now()}`);
    await dialog.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(dialog.getByText(/no data found/i)).toBeVisible({ timeout: 20_000 });
    await context.close();
  });

  test("a mistyped sync code is called out as one, not blamed on the data", async ({ browser }) => {
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await context.newPage();
    await advanceToProfileForm(page);
    await page.getByRole("button", { name: /restore from sync/i }).click();
    const dialog = page.getByRole("dialog");
    // A code with a character flipped: the checksum must catch it and say so.
    await dialog
      .getByLabel("Sync code or passphrase")
      .fill("C3-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG");
    await dialog.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(dialog.getByText(/not a complete sync code/i)).toBeVisible({ timeout: 20_000 });
    await context.close();
  });
});
