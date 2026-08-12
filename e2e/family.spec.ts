import { expect, test } from "./fixtures";
import { createProfile } from "./helpers";

test.describe("family profiles", () => {
  test("launch picker appears with several profiles and PIN gates switching", async ({ page }) => {
    // First profile via onboarding, second via the profile page.
    await createProfile(page, "Anna");
    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: /add household profile/i }).click();
    await page.getByPlaceholder("e.g. Alex").fill("Bertil");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Bertil" })).toBeVisible();

    // Protect Bertil with a PIN.
    await page.getByRole("button", { name: "Set PIN", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("New PIN").fill("4711");
    await dialog.getByLabel("Repeat PIN").fill("4711");
    await dialog.getByRole("button", { name: "Set PIN", exact: true }).click();
    await expect(page.getByText(/PIN set for Bertil/)).toBeVisible();

    // A fresh launch shows the picker (session choice hasn't been made).
    await page.reload();
    const picker = page.getByRole("dialog", { name: "Who is training?" });
    await expect(picker).toBeVisible();

    // Anna has no PIN: picking her goes straight through.
    await picker.getByRole("button", { name: /Anna/ }).click();
    await expect(picker).toHaveCount(0);
    await expect(page.getByText(/Anna/).first()).toBeVisible();

    // Switching back to Bertil requires his PIN; a wrong PIN is rejected.
    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: /Bertil/ }).click();
    const pinDialog = page.getByRole("dialog");
    await pinDialog.getByLabel("PIN code").fill("0000");
    await pinDialog.getByRole("button", { name: "Unlock" }).click();
    await expect(pinDialog.getByText(/wrong pin/i)).toBeVisible();

    await pinDialog.getByLabel("PIN code").fill("4711");
    await pinDialog.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("heading", { name: "Bertil" })).toBeVisible();
  });
});
