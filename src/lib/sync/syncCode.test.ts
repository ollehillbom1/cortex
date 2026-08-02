import { describe, expect, it } from "vitest";
import {
  formatSyncCode,
  generateSyncSeed,
  looksLikeSyncCode,
  parseSyncCode,
  SyncCodeFormatError,
} from "./syncCode";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function seedOf(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes.concat(Array(16 - bytes.length).fill(0)));
}

describe("sync code", () => {
  it("round-trips any seed through format and parse", () => {
    for (let i = 0; i < 50; i++) {
      const seed = generateSyncSeed();
      expect(parseSyncCode(formatSyncCode(seed))).toEqual(seed);
    }
  });

  it("has the documented shape", () => {
    const code = formatSyncCode(generateSyncSeed());
    expect(code).toMatch(/^C3-([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it("two generated seeds never share a code", () => {
    // 128 random bits: a collision here means the generator is broken.
    const codes = new Set(Array.from({ length: 200 }, () => formatSyncCode(generateSyncSeed())));
    expect(codes.size).toBe(200);
  });

  it("parses hand-typed forms: lowercase, spaces, missing dashes, o/i/l confusions", () => {
    const seed = seedOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const code = formatSyncCode(seed);
    expect(parseSyncCode(code.toLowerCase())).toEqual(seed);
    expect(parseSyncCode(code.replace(/-/g, " "))).toEqual(seed);
    expect(parseSyncCode(code.replace(/-/g, ""))).toEqual(seed);
    // A reader who writes 0 as O or 1 as l gets mapped back.
    expect(parseSyncCode(code.replace(/0/g, "O").replace(/1/g, "l"))).toEqual(seed);
  });

  it("rejects every single-character substitution (checksum)", () => {
    const compact = formatSyncCode(generateSyncSeed()).replace(/-/g, "");
    // Positions 2.. are payload+check; flipping any one char must be caught.
    for (let i = 2; i < compact.length; i++) {
      for (const wrong of [ALPHABET[0], ALPHABET[7], ALPHABET[31]]) {
        if (compact[i] === wrong) continue;
        const mutated = compact.slice(0, i) + wrong + compact.slice(i + 1);
        expect(() => parseSyncCode(mutated), `pos ${i} -> ${wrong}`).toThrow(SyncCodeFormatError);
      }
    }
  });

  it("rejects adjacent transpositions", () => {
    for (let round = 0; round < 20; round++) {
      const compact = formatSyncCode(generateSyncSeed()).replace(/-/g, "");
      for (let i = 2; i < compact.length - 1; i++) {
        if (compact[i] === compact[i + 1]) continue;
        const swapped = compact.slice(0, i) + compact[i + 1] + compact[i] + compact.slice(i + 2);
        expect(() => parseSyncCode(swapped), `swap at ${i}`).toThrow(SyncCodeFormatError);
      }
    }
  });

  it("rejects truncation, garbage and the wrong prefix", () => {
    const code = formatSyncCode(generateSyncSeed());
    expect(() => parseSyncCode(code.slice(0, -1))).toThrow(SyncCodeFormatError);
    expect(() => parseSyncCode(code + "A")).toThrow(SyncCodeFormatError);
    expect(() => parseSyncCode("")).toThrow(SyncCodeFormatError);
    expect(() => parseSyncCode("hemlig lösenfras")).toThrow(SyncCodeFormatError);
    expect(() => parseSyncCode("X9" + code.slice(2))).toThrow(SyncCodeFormatError);
  });

  it("tells codes and passphrases apart where it matters", () => {
    expect(looksLikeSyncCode(formatSyncCode(generateSyncSeed()))).toBe(true);
    // A mangled but clearly-intended code stays in the code path...
    expect(looksLikeSyncCode(formatSyncCode(generateSyncSeed()).slice(0, -2))).toBe(true);
    // ...while ordinary passphrases, even c3-flavoured ones, do not.
    expect(looksLikeSyncCode("hemlig lösenfras")).toBe(false);
    expect(looksLikeSyncCode("c3po is my droid")).toBe(false);
  });
});
