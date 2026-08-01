import { expect, test } from "@playwright/test";
import { createProfile, playReactionBlock } from "./helpers";

/**
 * Practice mode: one exercise at a chosen, fixed level, outside progression.
 * The contract under test is the "outside" part — a practice session must
 * leave XP, streak and session history exactly as they were.
 */
test.describe("practice mode", () => {
  test("a practice session runs at the chosen level and leaves no trace", async ({ page }) => {
    await createProfile(page, "Trainee");

    // Open the practice picker from the library.
    await page.getByRole("link", { name: "Train", exact: true }).click();
    await page.getByRole("button", { name: /practice reaction/i }).click();

    // Raise the level from 1 to 3 and pick 3 rounds.
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /raise level/i }).click();
    await dialog.getByRole("button", { name: /raise level/i }).click();
    await expect(dialog.getByRole("group", { name: "Level" }).getByText("3")).toBeVisible();
    await dialog.getByRole("button", { name: "3", exact: true }).click();
    await dialog.getByRole("button", { name: /start practice/i }).click();

    // Instructions carry the chosen settings and the no-progress promise.
    await page.waitForURL(/\/session\?exercise=reaction-time&level=3&rounds=3/);
    await expect(page.getByText("Level 3 · 3 rounds")).toBeVisible();
    await expect(page.getByText(/practice — does not affect/i)).toBeVisible();

    await playReactionBlock(page, 3);

    // Practice summary: accuracy yes, XP and streak no.
    await expect(page.getByText(/practice — does not affect/i)).toBeVisible();
    await expect(page.getByText(/\+\d+ XP/)).toHaveCount(0);
    await expect(page.getByText(/-day streak/)).toHaveCount(0);
    await page.getByRole("button", { name: /^done$/i }).click();
    await page.waitForURL(/\/$/);

    // Nothing persisted: no reaction result on home, no record in stats.
    await expect(page.getByText("Goal reached ✓")).toHaveCount(0);
    await page.getByRole("link", { name: "Stats", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Statistics" })).toBeVisible();
    await expect(page.getByText("Best reaction")).toHaveCount(0);
  });
});
