import { expect, test } from "./fixtures";
import { createProfile } from "./helpers";

test.describe("localisation", () => {
  test("switching to Swedish translates the app and persists", async ({ page }) => {
    await createProfile(page, "Svea");

    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Svenska" }).click();

    // The page re-renders in Swedish.
    await expect(page.getByRole("heading", { name: "Inställningar" })).toBeVisible();

    // Home is Swedish too, and the choice survives a reload.
    await page.getByRole("link", { name: "Idag", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dagens träning" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dagens träning" })).toBeVisible();

    // Back to English.
    await page.getByRole("link", { name: "Profil", exact: true }).click();
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "Preferences" })).toBeVisible();
  });
});
