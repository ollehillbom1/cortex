/**
 * Optional per-profile PIN (issue #8).
 *
 * Honest threat model (see PRIVACY.md): the PIN is a courtesy barrier so
 * household members don't train on each other's profiles. All data lives
 * client-side, so anyone with browser access can bypass it via DevTools —
 * it is NOT a security boundary and is documented as such.
 *
 * The PIN is stored as SHA-256(salt + pin) with a random salt, so at least
 * the digits themselves are not stored in clear text.
 */

export interface PinRecord {
  salt: string;
  hash: string;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  const salt = generateSalt();
  return { salt, hash: await hashPin(pin, salt) };
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  return (await hashPin(pin, record.salt)) === record.hash;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
