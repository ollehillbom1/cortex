import { expect, type Page } from "@playwright/test";

/** Walk the onboarding flow and create a profile named `name`. */
export async function createProfile(page: Page, name = "Testa") {
  await page.goto("/");
  await page.waitForURL("**/welcome");
  for (let i = 0; i < 3; i++) {
    // Retry the click until the step indicator advances — a click that lands
    // before React hydration would otherwise be silently swallowed.
    await expect(async () => {
      await page.getByRole("button", { name: /get started|continue/i }).click();
      await expect(page.getByLabel(`Step ${i + 2} of 4`)).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  }
  await page.getByPlaceholder("e.g. Olle").fill(name);
  await page.getByRole("button", { name: /start training/i }).click();
  await page.waitForURL(/\/$/);
}

/**
 * Play one full Reaction block (5 rounds): wait for GO each round, click,
 * then continue through the feedback screen.
 */
export async function playReactionBlock(page: Page) {
  await page.goto("/session?exercise=reaction-time");
  await page.getByRole("button", { name: /start reaction/i }).click();
  for (let round = 0; round < 5; round++) {
    const arm = page.getByRole("button", { name: /tap to arm/i });
    await arm.waitFor({ state: "visible", timeout: 15_000 });
    await arm.click();
    const go = page.getByRole("button", { name: "GO!" });
    await go.waitFor({ state: "visible", timeout: 10_000 });
    await go.click();
    // Feedback interstitial: continue explicitly (there is also auto-advance).
    const cont = page.getByRole("button", { name: /^continue$/i });
    if (await cont.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cont.click().catch(() => {
        /* auto-advance may have beaten us to it */
      });
    }
  }
  await page.getByRole("heading", { name: /session complete/i }).waitFor({ timeout: 15_000 });
}
