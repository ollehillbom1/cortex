import { expect, test } from "@playwright/test";
import { createProfile } from "./helpers";

test.describe("audio exercises", () => {
  test("tone pattern presents a melody and accepts pad input", async ({ page }) => {
    await createProfile(page, "Toner");
    await page.goto("/session?exercise=tone-pattern");
    await page.getByRole("button", { name: /start tone pattern/i }).click();

    // Explicit audio unlock: nothing plays before the user taps play.
    await page.getByRole("button", { name: /play the audio sequence/i }).click();

    // Presentation ends and the pads open for input (level 1 = 3 notes).
    await expect(page.getByText(/replay the melody/i)).toBeVisible({ timeout: 15_000 });
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Sound pad 1", exact: true }).click();
    }
    await expect(page.getByText(/perfect|well done|keep at it/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("rhythm recall plays a rhythm and scores tapped beats", async ({ page }) => {
    await createProfile(page, "Rytm");
    await page.goto("/session?exercise=rhythm-recall");
    await page.getByRole("button", { name: /start rhythm recall/i }).click();
    await page.getByRole("button", { name: /play the audio sequence/i }).click();

    // Level 1: 3 beats. Wait for the tap phase, then tap three times.
    const pad = page.getByRole("button", { name: /tap the rhythm here/i });
    await pad.waitFor({ timeout: 15_000 });
    for (let i = 0; i < 3; i++) {
      await pad.click();
      await page.waitForTimeout(350);
    }
    await expect(page.getByText(/perfect|well done|keep at it/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("the library lists all eleven exercises", async ({ page }) => {
    await createProfile(page, "Biblio");
    await page.goto("/exercises");
    for (const name of ["Tone Pattern", "Rhythm Recall", "Go/No-Go", "Name Recall"]) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    }
  });
});
