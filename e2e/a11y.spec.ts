import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createProfile } from "./helpers";

/**
 * Automated accessibility audit (issue #6). Fails on serious/critical axe
 * violations on every main surface, including in-session screens.
 */

async function expectNoSeriousViolations(page: Page, context: string) {
  // Surfaces fade in via the `rise-in` keyframes. Axe reads the *current*
  // computed colour, so auditing mid-animation measures a part-way blend
  // against the background and reports contrast failures that do not exist
  // once the text has settled (e.g. --color-ink-faint lands at 5.6:1, but was
  // being sampled at 3.3:1). Wait for animations to finish before auditing.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState === "finished"),
  );
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious,
    `${context}: ${serious.map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} nodes]`).join("; ")}`,
  ).toEqual([]);
}

test.describe("axe accessibility audit", () => {
  test("onboarding is free of serious violations", async ({ page }) => {
    await page.goto("/welcome");
    await page.getByRole("button", { name: /get started/i }).waitFor();
    await expectNoSeriousViolations(page, "welcome step 1");
  });

  test("main tabs are free of serious violations", async ({ page }) => {
    await createProfile(page, "Axe");
    await expectNoSeriousViolations(page, "home");

    await page.goto("/exercises");
    await expectNoSeriousViolations(page, "exercises");

    await page.goto("/stats");
    await expectNoSeriousViolations(page, "stats");

    await page.goto("/profile");
    await expectNoSeriousViolations(page, "profile");

    // The privacy page is linked from Profile and used to 404 in production;
    // scanning it keeps the one page about data handling from rotting.
    await page.goto("/privacy");
    await expectNoSeriousViolations(page, "privacy");
  });

  test("the privacy page the app links to actually exists", async ({ page }) => {
    const response = await page.goto("/privacy");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
    await expect(page.getByText(/end-to-end encrypted/i).first()).toBeVisible();
  });

  test("session screens are free of serious violations", async ({ page }) => {
    await createProfile(page, "AxeSession");
    await page.goto("/session?exercise=reaction-time");
    await page.getByRole("button", { name: /start reaction/i }).waitFor();
    await expectNoSeriousViolations(page, "exercise instructions");

    // Quit dialog (focus-trapped modal).
    await page.getByRole("button", { name: /end session/i }).click();
    await page.getByRole("dialog").waitFor();
    await expectNoSeriousViolations(page, "quit dialog");
  });

  test("vision-only exercises can be filtered out of the library and plans", async ({ page }) => {
    await createProfile(page, "Ears");
    await page.goto("/exercises");
    await expect(page.getByRole("heading", { name: "Pattern Recall" })).toBeVisible();

    await page.goto("/profile");
    // Operate the switch from the keyboard — it is a visually-hidden input
    // behind a styled track, so this is also the assistive-tech path.
    const skipVisual = page.getByRole("checkbox", { name: /skip exercises that need sight/i });
    await skipVisual.focus();
    await page.keyboard.press("Space");
    await expect(skipVisual).toBeChecked();

    await page.goto("/exercises");
    // Vision-only exercises are gone; the auditory ones remain playable.
    await expect(page.getByRole("heading", { name: "Pattern Recall" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Tone Pattern" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rhythm Recall" })).toBeVisible();

    // They stay reachable behind an explicit toggle — nothing is removed.
    await page.getByRole("button", { name: /exercises that need sight/i }).click();
    await expect(page.getByRole("heading", { name: "Pattern Recall" })).toBeVisible();

    // The recommended plan only draws from the non-visual set.
    await page.goto("/");
    const plan = page.getByRole("main");
    await expect(plan.getByText(/Pattern Recall|Sequence Memory|N-Back|Reaction/)).toHaveCount(0);
  });

  test("quit dialog traps focus and closes on Escape", async ({ page }) => {
    await createProfile(page, "Trap");
    await page.goto("/session?exercise=reaction-time");
    await page.getByRole("button", { name: /start reaction/i }).waitFor();
    await page.getByRole("button", { name: /end session/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();

    // Focus lands inside the dialog and Tab cycles within it.
    await expect(dialog.getByRole("button", { name: /keep training/i })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: /end session/i })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: /keep training/i })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});
