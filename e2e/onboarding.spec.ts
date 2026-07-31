import { expect, test } from "@playwright/test";
import { createProfile } from "./helpers";

test.describe("onboarding and profiles", () => {
  test("new user completes onboarding and the profile persists after reload", async ({ page }) => {
    await createProfile(page, "Nova");

    await expect(page.getByText(/Nova/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today's training" })).toBeVisible();

    // Progression must survive a full reload (IndexedDB, not React state).
    await page.reload();
    await expect(page.getByText(/Nova/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today's training" })).toBeVisible();
  });

  test("recommended session shows a multi-exercise plan with an estimate", async ({ page }) => {
    await createProfile(page);
    await page.getByRole("button", { name: /start session/i }).click();
    await page.waitForURL("**/session");

    await expect(page.getByRole("heading", { name: /today's session/i })).toBeVisible();
    await expect(page.getByText(/about \d+ min/)).toBeVisible();
    // The plan lists between 3 and 5 exercises.
    const rows = page.locator("ol li");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(5);
  });

  test("a second household profile can be created and switched to", async ({ page }) => {
    await createProfile(page, "Alfa");
    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: /add household profile/i }).click();
    await page.getByPlaceholder("e.g. Alex").fill("Beta");
    await page.getByRole("button", { name: /^create$/i }).click();

    // The new profile becomes active.
    await expect(page.getByRole("heading", { name: "Beta" })).toBeVisible();
    // Switch back.
    await page.getByRole("button", { name: /Alfa/ }).click();
    await expect(page.getByRole("heading", { name: "Alfa" })).toBeVisible();
  });
});
