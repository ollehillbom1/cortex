import { describe, expect, it } from "vitest";
import { EXPORT_STALE_DAYS, MIN_SESSIONS_FOR_REMINDER, shouldRemindBackup } from "./backupReminder";

const NOW = new Date("2026-07-31T12:00:00Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

describe("backup reminder policy", () => {
  it("stays quiet before meaningful progress exists", () => {
    expect(
      shouldRemindBackup({
        lastExportAt: null,
        dismissedAt: null,
        sessionCount: MIN_SESSIONS_FOR_REMINDER - 1,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("reminds when there is progress and no export ever", () => {
    expect(
      shouldRemindBackup({ lastExportAt: null, dismissedAt: null, sessionCount: 10, now: NOW }),
    ).toBe(true);
  });

  it("stays quiet while the last export is fresh", () => {
    expect(
      shouldRemindBackup({
        lastExportAt: daysAgo(EXPORT_STALE_DAYS - 1),
        dismissedAt: null,
        sessionCount: 10,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("reminds again once the export goes stale", () => {
    expect(
      shouldRemindBackup({
        lastExportAt: daysAgo(EXPORT_STALE_DAYS + 1),
        dismissedAt: null,
        sessionCount: 10,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("a dismissal snoozes for the full period", () => {
    expect(
      shouldRemindBackup({
        lastExportAt: null,
        dismissedAt: daysAgo(1),
        sessionCount: 10,
        now: NOW,
      }),
    ).toBe(false);
    expect(
      shouldRemindBackup({
        lastExportAt: null,
        dismissedAt: daysAgo(EXPORT_STALE_DAYS + 1),
        sessionCount: 10,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("tolerates malformed or future timestamps", () => {
    expect(
      shouldRemindBackup({
        lastExportAt: "not-a-date",
        dismissedAt: null,
        sessionCount: 10,
        now: NOW,
      }),
    ).toBe(true);
    // A future timestamp (clock skew) is treated as not-within-window.
    expect(
      shouldRemindBackup({
        lastExportAt: daysAgo(-2),
        dismissedAt: null,
        sessionCount: 10,
        now: NOW,
      }),
    ).toBe(true);
  });
});
