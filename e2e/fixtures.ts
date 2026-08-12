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
export const test = base.extend<{ consoleNet: void }>({
  consoleNet: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      await use();
      const benign = [/Failed to load resource/i, /net::ERR_/i];
      const real = errors.filter((e) => !benign.some((p) => p.test(e)));
      expect(real, `console errors during "${testInfo.title}"`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export { devices } from "@playwright/test";
export type { Page } from "@playwright/test";
