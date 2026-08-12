import { expect, test } from "./fixtures";
import { createProfile } from "./helpers";

/**
 * The optional coach (issue #11 phase 2) must be invisible and inert on a
 * default deployment: no endpoint configured means no setting, no network
 * call, and the deterministic insight wording stands.
 */
test.describe("optional AI coach", () => {
  test("reports itself unconfigured and refuses work by default", async ({ request }) => {
    const status = await request.get("/api/coach");
    expect(status.status()).toBe(200);
    expect(await status.json()).toEqual({ configured: false });

    const attempt = await request.post("/api/coach", {
      data: { facts: [{ kind: "streak-at-risk", days: 3 }], locale: "en" },
    });
    expect(attempt.status()).toBe(503);
  });

  test("offers no setting when the operator has not configured an endpoint", async ({ page }) => {
    await createProfile(page, "NoCoach");
    await page.goto("/profile");
    await expect(page.getByText(/AI phrasing of insights/i)).toHaveCount(0);
  });

  test("never posts to the coach endpoint without opt-in", async ({ page }) => {
    // The profile page does GET /api/coach to decide whether to show the
    // setting — same-origin, no payload. What must never happen unasked is a
    // POST, which is the only request that carries data anywhere.
    const posts: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/coach") && req.method() === "POST") posts.push(req.url());
    });
    await createProfile(page, "Quiet");
    await page.goto("/");
    await page.goto("/exercises");
    await page.goto("/stats");
    await page.goto("/profile");
    expect(posts).toEqual([]);
  });

  test("error responses carry no upstream detail", async ({ request }) => {
    const res = await request.post("/api/coach", {
      data: { facts: [{ kind: "streak-at-risk", days: 3 }], locale: "en" },
    });
    const body = await res.text();
    // Unconfigured here, but the invariant is what matters: no hostnames,
    // ports, IPs or stack traces ever reach the client.
    expect(body).not.toMatch(/ENOTFOUND|ECONNREFUSED|:\d{4,5}\b|at .+\.ts:/);
  });
});
