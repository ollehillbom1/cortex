import { describe, expect, it } from "vitest";
import { MAX_LEVEL, MIN_LEVEL } from "@/lib/adaptive/engine";
import { parsePracticeParams } from "./practice";

describe("parsePracticeParams", () => {
  it("accepts a whole level within the engine's range", () => {
    expect(parsePracticeParams("7", null)).toEqual({ level: 7, rounds: null });
    expect(parsePracticeParams(String(MIN_LEVEL), null)).toEqual({
      level: MIN_LEVEL,
      rounds: null,
    });
    expect(parsePracticeParams(String(MAX_LEVEL), null)).toEqual({
      level: MAX_LEVEL,
      rounds: null,
    });
  });

  it("rejects a missing, fractional or out-of-range level entirely", () => {
    // No valid level means no practice session — the URL was hand-mangled.
    expect(parsePracticeParams(null, "5")).toBeNull();
    expect(parsePracticeParams("3.5", null)).toBeNull();
    expect(parsePracticeParams("0", null)).toBeNull();
    expect(parsePracticeParams(String(MAX_LEVEL + 1), null)).toBeNull();
    expect(parsePracticeParams("banana", null)).toBeNull();
    expect(parsePracticeParams("", null)).toBeNull();
  });

  it("accepts rounds in range and quietly drops malformed ones", () => {
    expect(parsePracticeParams("5", "10")).toEqual({ level: 5, rounds: 10 });
    // Malformed rounds fall back to the exercise default instead of
    // rejecting a session the user deliberately configured a level for.
    expect(parsePracticeParams("5", "0")).toEqual({ level: 5, rounds: null });
    expect(parsePracticeParams("5", "21")).toEqual({ level: 5, rounds: null });
    expect(parsePracticeParams("5", "2.5")).toEqual({ level: 5, rounds: null });
    expect(parsePracticeParams("5", "x")).toEqual({ level: 5, rounds: null });
  });
});
