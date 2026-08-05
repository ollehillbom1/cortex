import { expect, test } from "@playwright/test";
import { createProfile } from "./helpers";

test.describe("onboarding and profiles", () => {
  test("a phone visitor is shown how to put Cortex on the home screen", async ({ page }) => {
    // The e2e browser presents an iPhone UA, so the welcome page must show
    // the Safari share-sheet steps — Apple offers no API, instructions are
    // the ceiling. Dismissal must stick across reloads: a hint that nags
    // after "don't show this again" teaches people to ignore hints.
    await page.goto("/welcome");
    const hint = page.getByRole("region", { name: /install cortex on your home screen/i });
    await expect(hint).toBeVisible();
    await expect(hint.getByText(/add to home screen/i)).toBeVisible();

    // Detection picks the default, never what is reachable: an Android
    // owner landing here must find their own steps without leaving.
    await hint.getByRole("button", { name: /on an android phone/i }).click();
    await expect(hint.getByText(/add to home screen.*or.*install app/i)).toBeVisible();
    await hint.getByRole("button", { name: /on an iphone or ipad/i }).click();
    await expect(hint.getByText(/tap the share button in safari/i)).toBeVisible();

    await hint.getByRole("button", { name: /don't show this again/i }).click();
    await expect(hint).toBeHidden();
    await page.reload();
    await expect(
      page.getByRole("region", { name: /install cortex on your home screen/i }),
    ).toBeHidden();
  });

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
