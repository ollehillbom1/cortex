import { expect, test } from "./fixtures";
import { createProfile } from "./helpers";

/**
 * Bounded monkey walk: a seeded random tour of the app — tapping whatever
 * is on screen, switching tabs, backgrounding mid-round — with the console
 * net armed and a sanity check at the end. This is aimed squarely at the
 * app's historical bug class: timers and state that outlive the screen
 * they belong to (the #30 family), which scripted flows step politely
 * around and a monkey stumbles straight into.
 *
 * Reproducibility: the walk is driven by a seeded PRNG; the seed is in the
 * log line below. DOM order can still vary slightly run to run, so treat a
 * failure's step list as the repro script, not the seed alone.
 */

/** mulberry32 — inlined; e2e specs do not import app modules. */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260812;
const STEPS = 90;

// Never poke destructive or environment-escaping controls: deleting the
// profile ends the walk trivially, and export/import open native dialogs
// that hang a headless browser.
const BLOCKLIST = /delete|reset|remove|export|import|create a new code|copy/i;

test("a seeded monkey walk leaves no errors and an intact profile", async ({ page }) => {
  test.setTimeout(180_000);
  const rng = createRng(SEED);
  await createProfile(page, "Monkey");
  const steps: string[] = [];

  for (let i = 0; i < STEPS; i++) {
    const roll = rng();
    try {
      if (roll < 0.08) {
        // Background and return: the round-discarding path.
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "hidden",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await page.waitForTimeout(150);
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        steps.push(`${i}: background/return`);
      } else if (roll < 0.16) {
        const tab = ["/", "/exercises", "/stats", "/profile"][Math.floor(rng() * 4)];
        await page.goto(tab);
        steps.push(`${i}: goto ${tab}`);
      } else if (roll < 0.24) {
        await page.keyboard.press(
          ["Space", "1", "2", "5", "Enter", "Escape"][Math.floor(rng() * 6)],
        );
        steps.push(`${i}: keypress`);
      } else {
        const buttons = await page
          .locator("button:visible, a[href^='/']:visible")
          .all()
          .then((els) => els.slice(0, 40));
        if (buttons.length === 0) {
          await page.goto("/");
          steps.push(`${i}: recover to /`);
          continue;
        }
        const pick = buttons[Math.floor(rng() * buttons.length)];
        const label = ((await pick.textContent()) ?? (await pick.getAttribute("aria-label")) ?? "")
          .trim()
          .slice(0, 40);
        if (BLOCKLIST.test(label)) {
          steps.push(`${i}: skipped "${label}"`);
          continue;
        }
        await pick.click({ timeout: 2_000, noWaitAfter: true });
        steps.push(`${i}: tap "${label}"`);
      }
      await page.waitForTimeout(120);
    } catch {
      // A vanished element mid-click is the monkey's life, not a defect.
      steps.push(`${i}: (stale target)`);
    }
  }

  // The walk itself asserts nothing; these do. Attach the script for repro.
  test.info().attach("monkey-steps", { body: steps.join("\n") });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cortex" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Monkey/)).toBeVisible();
  // The console net fixture fails the test on any error the walk provoked.
});
