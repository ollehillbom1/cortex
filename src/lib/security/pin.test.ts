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
    const record = await createPinRecord("9876");
    expect(JSON.stringify(record)).not.toContain("9876");
  });
});
