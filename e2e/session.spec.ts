import { expect, test } from "@playwright/test";
import { createProfile, playReactionBlock } from "./helpers";

test.describe("training sessions", () => {
  test("backgrounding the app discards the round instead of scoring it", async ({ page }) => {
    // A hidden tab freezes timers, so time spent away lands in the reaction
    // time and in the fatigue estimate. Nothing used to notice: the round was
    // scored as if the user had been looking at it the whole time.
    await createProfile(page, "Bakgrund");
    await page.goto("/session?exercise=reaction-time");
    await page.getByRole("button", { name: /start reaction/i }).click();

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await expect(page.getByText(/round paused/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/was not scored/i)).toBeVisible();

    // The round is replayable, and nothing was recorded in the meantime.
    await page.getByRole("button", { name: /play this round again/i }).click();
    await expect(page.getByText(/round paused/i)).toBeHidden();
  });

  test("completing a reaction block persists results, XP and streak", async ({ page }) => {
    await createProfile(page, "Runner");

    await playReactionBlock(page);

    // Summary shows the block and earned XP.
    await expect(page.getByText(/\+\d+ XP/).first()).toBeVisible();
    await expect(page.getByText(/1-day streak/)).toBeVisible();
    await page.getByRole("button", { name: /^done$/i }).click();
    await page.waitForURL(/\/$/);

    // Home reflects the completed session.
    await expect(page.getByText(/Reaction/).first()).toBeVisible();

    // Reload: results must come back from IndexedDB.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Today's training" })).toBeVisible();
    await expect(page.getByText("Goal reached ✓").or(page.getByText(/\d+\/\d+ min/))).toBeVisible();

    // Stats shows the session and a reaction record.
    await page.getByRole("link", { name: "Stats", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Statistics" })).toBeVisible();
    await expect(page.getByText("Best reaction")).toBeVisible();
  });

  test("quitting early without completed exercises saves nothing", async ({ page }) => {
    await createProfile(page, "Quitter");
    await page.goto("/session?exercise=number-span");
    await page.getByRole("button", { name: /start number span/i }).click();
    await page.getByRole("button", { name: /end session/i }).click();
    await expect(page.getByText(/nothing will be saved/i)).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /end session/i })
      .click();
    await page.waitForURL(/\/$/);
    await expect(page.getByText(/no sessions yet/i)).toBeVisible();
  });

  test("number span presents digits and accepts keypad input", async ({ page }) => {
    await createProfile(page, "Spanner");
    await page.goto("/session?exercise=number-span");
    await page.getByRole("button", { name: /start number span/i }).click();

    // Presentation phase, then the keypad appears.
    await expect(page.getByText(/memorise the digits/i)).toBeVisible();
    await expect(page.getByRole("group", { name: "Digit keypad" })).toBeVisible({
      timeout: 15_000,
    });
    // Answer (wrong answers are fine — the round still completes).
    for (const d of [1, 2, 3]) {
      await page.getByRole("button", { name: String(d), exact: true }).click();
    }
    await expect(page.getByText(/perfect|well done|keep at it/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
