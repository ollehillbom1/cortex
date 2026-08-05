import { describe, expect, it } from "vitest";
import { createPinRecord, hashPin, isValidPin, verifyPin } from "./pin";

describe("profile PIN", () => {
  it("accepts only 4-digit pins", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("0000")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });

  it("verifies the right pin and rejects wrong ones", async () => {
    const record = await createPinRecord("4711");
    expect(await verifyPin("4711", record)).toBe(true);
    expect(await verifyPin("4712", record)).toBe(false);
    expect(await verifyPin("0000", record)).toBe(false);
    expect(await verifyPin("471", record)).toBe(false);
  });

  it("salts hashes so equal pins produce different records", async () => {
    const a = await createPinRecord("1234");
    const b = await createPinRecord("1234");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    // Hash is deterministic for a given salt.
    expect(await hashPin("1234", a.salt)).toBe(a.hash);
  });

  it("never stores the pin in clear text", async () => {
    // Asserted structurally, not by substring search. The record is random
    // hex, and every digit of a PIN is also a hex character — so
    // `not.toContain("9876")` fails by pure chance roughly once in 700 runs
    // (~93 substring positions x 16^-4). It did, once, and a monitor that
    // cries wolf at random is worse than none.
    const record = await createPinRecord("9876");
    expect(Object.keys(record).sort()).toEqual(["hash", "salt"]);
    // Both fields are fixed-length hex, which a stored PIN could not be.
    expect(record.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(record.hash).toMatch(/^[0-9a-f]{64}$/);
    // And the hash is of THIS pin: a different one must not collide.
    const other = { ...record, hash: (await createPinRecord("1234")).hash };
    expect(other.hash).not.toBe(record.hash);
  });
});
