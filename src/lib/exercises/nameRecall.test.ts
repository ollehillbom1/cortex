import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/engine/rng";
import { faceDistance, generateFaces } from "./faces";
import {
  generateNameRecallRound,
  NAME_LISTS,
  nameRecallParams,
  namesForLocale,
  scoreNameRecall,
} from "./nameRecall";

describe("name recall", () => {
  it("generates pairwise distinct faces, deterministically", () => {
    const faces = generateFaces(createRng(7), 8);
    expect(faces).toHaveLength(8);
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        // Clearly tellable-apart: memory is the test, not perception.
        expect(faceDistance(faces[i], faces[j])).toBeGreaterThanOrEqual(3);
      }
    }
    expect(generateFaces(createRng(7), 8)).toEqual(faces);
  });

  it("builds a quiz that permutes the study order with exactly one right option", () => {
    const params = nameRecallParams(13); // 5 pairs, 4 options
    const round = generateNameRecallRound(createRng(11), params, NAME_LISTS.en);
    expect(round.pairs).toHaveLength(params.pairs);
    expect(new Set(round.pairs.map((p) => p.name)).size).toBe(params.pairs);

    // Every pair is quizzed exactly once.
    expect([...round.quiz.map((q) => q.pairIndex)].sort()).toEqual(round.pairs.map((_, i) => i));
    for (const q of round.quiz) {
      expect(q.options).toHaveLength(params.options);
      expect(new Set(q.options).size).toBe(params.options);
      const correct = round.pairs[q.pairIndex].name;
      expect(q.options.filter((o) => o === correct)).toHaveLength(1);
    }
  });

  it("prefers the other studied names as distractors", () => {
    // With 5 pairs and 4 options there are enough studied names to fill
    // every line-up: confusing among what was just learned is the test.
    const params = nameRecallParams(13);
    const round = generateNameRecallRound(createRng(3), params, NAME_LISTS.en);
    const studied = new Set(round.pairs.map((p) => p.name));
    for (const q of round.quiz) {
      for (const option of q.options) expect(studied.has(option)).toBe(true);
    }
  });

  it("scores correct matches only, unanswered as wrong", () => {
    const round = generateNameRecallRound(createRng(5), nameRecallParams(1), NAME_LISTS.en);
    const allRight = round.quiz.map((q) => round.pairs[q.pairIndex].name);
    expect(scoreNameRecall(round, allRight)).toMatchObject({ accuracy: 1, perfect: true });

    const oneWrong: (string | null)[] = [...allRight];
    oneWrong[0] = round.quiz[0].options.find((o) => o !== allRight[0]) ?? null;
    const score = scoreNameRecall(round, oneWrong);
    expect(score.perfect).toBe(false);
    expect(score.accuracy).toBeCloseTo((round.pairs.length - 1) / round.pairs.length);

    expect(
      scoreNameRecall(
        round,
        round.quiz.map(() => null),
      ).accuracy,
    ).toBe(0);
  });

  it("serves Swedish names to Swedish profiles, matched list sizes", () => {
    expect(namesForLocale("sv")).toBe(NAME_LISTS.sv);
    expect(namesForLocale("en")).toBe(NAME_LISTS.en);
    expect(namesForLocale("auto")).toBe(NAME_LISTS.en);
    expect(NAME_LISTS.sv.length).toBe(NAME_LISTS.en.length);
    // No duplicates within a list — a duplicate name would make two quiz
    // options identical strings.
    expect(new Set(NAME_LISTS.en).size).toBe(NAME_LISTS.en.length);
    expect(new Set(NAME_LISTS.sv).size).toBe(NAME_LISTS.sv.length);
  });

  it("always has enough names for the largest round", () => {
    const max = nameRecallParams(26);
    // pairs studied + (options-1) distractors must fit the list even if
    // every distractor had to be a decoy.
    expect(NAME_LISTS.en.length).toBeGreaterThanOrEqual(max.pairs + max.options - 1);
  });
});
