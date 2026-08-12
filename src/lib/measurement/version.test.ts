import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ALL_EXERCISE_IDS, EXERCISES, type ExerciseId } from "@/lib/domain/types";
import { numberSpanParams } from "@/lib/exercises/numberSpan";
import { sequenceParams } from "@/lib/exercises/sequenceMemory";
import { patternParams } from "@/lib/exercises/visualPattern";
import { nBackParams } from "@/lib/exercises/nback";
import { dualNBackParams } from "@/lib/exercises/dualNBack";
import { goNoGoParams } from "@/lib/exercises/goNoGo";
import { nameRecallParams } from "@/lib/exercises/nameRecall";
import { tonePatternParams } from "@/lib/exercises/tonePattern";
import { rhythmParams } from "@/lib/exercises/rhythm";
import { reactionParams } from "@/lib/exercises/reaction";
import {
  DIFFICULTY_FINGERPRINT,
  MEASUREMENT_VERSION,
  spansMeasurementBreak,
  UNKNOWN_MEASUREMENT_VERSION,
} from "./version";

/**
 * The gate that makes the measurement version honest.
 *
 * A version number a human has to remember to bump is a version number that
 * stops being true. This fingerprints every exercise's difficulty ladder
 * from the live parameter functions: change a ramp and the fingerprint
 * changes, this test fails, and the failure message says which exercise
 * needs its MEASUREMENT_VERSION raised (and its ledger line written).
 *
 * Deliberately NOT a snapshot file: an obsolete snapshot can be blessed
 * away with -u without anyone thinking about what the change means for
 * months of recorded history. These values live in the source next to the
 * version they justify.
 */

/** The difficulty ladder as data: parameters for every exposed level. */
function difficultyLadder(id: ExerciseId): unknown[] {
  const levels = Array.from({ length: EXERCISES[id].maxLevel }, (_, i) => i + 1);
  switch (id) {
    case "number-span":
      return levels.map((l) => [0, 1].map((r) => numberSpanParams(l, r, "visual")));
    case "auditory-digits":
      return levels.map((l) => [0, 1].map((r) => numberSpanParams(l, r, "auditory")));
    case "sequence-memory":
      return levels.map(sequenceParams);
    case "visual-pattern":
      return levels.map(patternParams);
    case "n-back":
      return levels.map(nBackParams);
    case "dual-n-back":
      return levels.map(dualNBackParams);
    case "tone-pattern":
      return levels.map(tonePatternParams);
    case "rhythm-recall":
      return levels.map(rhythmParams);
    case "reaction-time":
      return levels.map(() => reactionParams());
    case "go-no-go":
      return levels.map(goNoGoParams);
    case "name-recall":
      return levels.map(nameRecallParams);
  }
}

function fingerprintOf(id: ExerciseId): string {
  return createHash("sha256")
    .update(JSON.stringify(difficultyLadder(id)))
    .digest("hex")
    .slice(0, 16);
}

describe("measurement version", () => {
  it("covers every exercise", () => {
    for (const id of ALL_EXERCISE_IDS) {
      expect(MEASUREMENT_VERSION[id], `${id} has no measurement version`).toBeGreaterThanOrEqual(1);
      expect(DIFFICULTY_FINGERPRINT[id], `${id} has no fingerprint`).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it.each(ALL_EXERCISE_IDS)("%s: difficulty ladder matches its recorded fingerprint", (id) => {
    const actual = fingerprintOf(id);
    expect(
      actual,
      `The difficulty ladder for "${id}" changed, so "level N" no longer means what it meant in ` +
        `recorded history. Raise MEASUREMENT_VERSION["${id}"] to ${MEASUREMENT_VERSION[id] + 1}, add a ` +
        `line to the ledger explaining what changed, and set DIFFICULTY_FINGERPRINT["${id}"] = "${actual}".`,
    ).toBe(DIFFICULTY_FINGERPRINT[id]);
  });

  it("treats unstamped results as an unknown mapping, not as the current one", () => {
    // Silently assuming old data used today's ladder is how a chart tells a
    // story that never happened.
    expect(spansMeasurementBreak([1, 1, 1])).toBe(false);
    expect(spansMeasurementBreak([undefined, undefined])).toBe(false);
    expect(spansMeasurementBreak([undefined, 1])).toBe(true);
    expect(spansMeasurementBreak([1, 2])).toBe(true);
    expect(spansMeasurementBreak([UNKNOWN_MEASUREMENT_VERSION, 1])).toBe(true);
    expect(spansMeasurementBreak([])).toBe(false);
  });
});
