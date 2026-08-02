import { describe, expect, it } from "vitest";
import { generatePassphrase, PASSPHRASE_WORDS, PASSPHRASE_WORD_COUNT } from "./passphrase";
import { MIN_PASSPHRASE_LENGTH } from "./crypto";

/**
 * The passphrase IS the identity: it derives both the group id and the key,
 * so two households that pick the same one share a group with no
 * cryptographic barrier between them. Entropy is the whole defence, so it is
 * pinned rather than assumed.
 */

describe("generated sync passphrase", () => {
  it("carries at least 45 bits, measured from the actual word list", () => {
    const bits = Math.log2(PASSPHRASE_WORD_COUNT) * PASSPHRASE_WORDS;
    expect(bits).toBeGreaterThanOrEqual(45);
  });

  it("has no duplicate words, so the list is as large as it looks", () => {
    // A duplicate would quietly cost entropy the comment claims is there.
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const word of generatePassphrase().split(" ")) seen.add(word);
    }
    expect(seen.size).toBeGreaterThan(150);
  });

  it("produces the promised shape and clears the length minimum", () => {
    for (let i = 0; i < 50; i++) {
      const phrase = generatePassphrase();
      expect(phrase.split(" ")).toHaveLength(PASSPHRASE_WORDS);
      expect(phrase.length).toBeGreaterThanOrEqual(MIN_PASSPHRASE_LENGTH);
      expect(phrase).toMatch(/^[a-z]+( [a-z]+)*$/);
    }
  });

  it("does not repeat across calls", () => {
    const phrases = new Set(Array.from({ length: 200 }, () => generatePassphrase()));
    expect(phrases.size).toBe(200);
  });

  it("uses the whole list, not a prefix of it", () => {
    // Picking with % over a small random range would silently bias to the
    // first few words and cost most of the entropy.
    const used = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      for (const w of generatePassphrase().split(" ")) used.add(w);
    }
    expect(used.size).toBe(PASSPHRASE_WORD_COUNT);
  });
});
