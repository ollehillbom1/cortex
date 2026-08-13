import { expect, test as base } from "@playwright/test";

/**
 * Console error net: every spec that imports `test` from here fails if the
 * page logged a console.error or threw an uncaught exception/rejection
 * during the test — every existing flow becomes a defect trap for free.
 *
 * Resource-load noise is filtered: the offline suite aborts requests on
 * purpose and the coach probes expect refusals, and those surface as
 * network-layer "Failed to load resource" lines rather than application
 * errors. Everything the APP says via console.error — React warnings
 * included — stays fatal.
 */
const BENIGN = [
  /Failed to load resource/i,
  /net::ERR_/i,
  // WebKit-only: it blocks Next.js's RSC prefetch (the `_rsc` query param
  // that <Link> warms) and reports it as a pageerror "due to access control
  // checks". Benign — the real navigation refetches on click, and Chromium
  // never emits it. Without this the net is flaky on WebKit for any test
  // that renders a prefetching <Link>, which is every page.
  /_rsc=.*due to access control checks/i,
];

export const test = base.extend<{ consoleNet: void }>({
  consoleNet: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      await use();
      const real = errors.filter((e) => !BENIGN.some((p) => p.test(e)));
      expect(real, `console errors during "${testInfo.title}"`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export { devices } from "@playwright/test";
export type { Page } from "@playwright/test";
