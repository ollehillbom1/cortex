import { describe, expect, it } from "vitest";
import { MEASUREMENT_VERSION } from "@/lib/measurement/version";
import { trackPersonalBest } from "./roundRecords";

const NOW = new Date("2026-08-11T12:00:00.000Z");

describe("trackPersonalBest", () => {
  it("treats a first-ever value as a personal best", () => {
    const { personalBest, records } = trackPersonalBest(
      {},
      "sequence-memory",
      { extras: { maxSequence: 4 } },
      NOW,
    );
    expect(personalBest).toBe(true);
    expect(records["sequence-memory:maxSequence"]).toMatchObject({
      value: 4,
      measurementVersion: MEASUREMENT_VERSION["sequence-memory"],
    });
  });

  it("pays for each improvement in a session, but not for equalling one", () => {
    const start = {
      "number-span:maxSpan": { value: 5, achievedAt: "2026-08-01T00:00:00.000Z" },
    };
    const first = trackPersonalBest(start, "number-span", { extras: { maxSpan: 6 } }, NOW);
    expect(first.personalBest).toBe(true);

    // The next round only matches the best set two rounds ago: no bonus —
    // the tracked records must include bests set earlier in the session.
    const repeat = trackPersonalBest(first.records, "number-span", { extras: { maxSpan: 6 } }, NOW);
    expect(repeat.personalBest).toBe(false);

    const better = trackPersonalBest(
      repeat.records,
      "number-span",
      { extras: { maxSpan: 7 } },
      NOW,
    );
    expect(better.personalBest).toBe(true);
  });

  it("compares reaction times lower-is-better", () => {
    const start = {
      "reaction-time:bestMs": {
        value: 300,
        achievedAt: "2026-08-01T00:00:00.000Z",
        measurementVersion: MEASUREMENT_VERSION["reaction-time"],
      },
    };
    expect(trackPersonalBest(start, "reaction-time", { responseMs: 280 }, NOW).personalBest).toBe(
      true,
    );
    expect(trackPersonalBest(start, "reaction-time", { responseMs: 320 }, NOW).personalBest).toBe(
      false,
    );
  });

  it("pays nothing for rounds with no record-worthy value", () => {
    // An imperfect span round reports no maxSpan…
    expect(trackPersonalBest({}, "number-span", { extras: {} }, NOW).personalBest).toBe(false);
    // …and responseMs is only a record for reaction-time.
    expect(
      trackPersonalBest({}, "sequence-memory", { responseMs: 1200, extras: {} }, NOW).personalBest,
    ).toBe(false);
  });

  it("does not mutate the input records", () => {
    const start = {};
    trackPersonalBest(start, "number-span", { extras: { maxSpan: 6 } }, NOW);
    expect(start).toEqual({});
  });
});
