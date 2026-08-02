/**
 * The v3 sync code: a random 128-bit seed, written for humans.
 *
 * Under v3 the code IS the sync identity. It is generated, never chosen, so
 * two households can never collide the way user-chosen passphrases could
 * (SEC-01), and the public endpoint's 404/200 answers are useless as a
 * guessing oracle against 128 bits. The same code is the invite (share it
 * with a new device) and the recovery (enter it after a reinstall) — which
 * is why the UI must insist the user saves it: if every device is gone, the
 * code is the only way back.
 *
 * Format: `C3-` followed by 26 Crockford-base32 characters of seed and two
 * check characters, grouped by four: C3-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX.
 * Crockford's alphabet drops I, L, O and U; parsing folds case and maps
 * i/l→1, o→0, so the code survives being read aloud or written by hand.
 * The check characters are the payload read as a base-32 number mod 1021
 * (prime), which catches every single-character typo and adjacent swap
 * rather than letting one land in a stranger's — or an empty — group.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SEED_BYTES = 16;
const PAYLOAD_CHARS = 26; // ceil(128 / 5); the last char carries 2 pad bits.
const CHECK_MODULUS = 1021; // Largest prime below 32², so two chars hold it.
const PREFIX = "C3";

export class SyncCodeFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncCodeFormatError";
  }
}

export function generateSyncSeed(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SEED_BYTES));
}

/** Render a seed as the canonical dashed display form. */
export function formatSyncCode(seed: Uint8Array): string {
  if (seed.length !== SEED_BYTES) throw new Error(`seed must be ${SEED_BYTES} bytes`);
  let bits = 0;
  let acc = 0;
  let payload = "";
  for (const byte of seed) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      payload += ALPHABET[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  payload += ALPHABET[(acc << (5 - bits)) & 31]; // 3 final bits + 2 pad bits.
  const body = payload + encodeCheck(checksum(payload));
  return PREFIX + "-" + body.match(/.{1,4}/g)!.join("-");
}

/**
 * Parse user input back to the seed. Throws SyncCodeFormatError on anything
 * that does not verify — a truncated paste, a typo the checksum catches.
 */
export function parseSyncCode(input: string): Uint8Array {
  const compact = normalize(input);
  if (!compact.startsWith(PREFIX) || compact.length !== PREFIX.length + PAYLOAD_CHARS + 2) {
    throw new SyncCodeFormatError("not a sync code");
  }
  const payload = compact.slice(PREFIX.length, PREFIX.length + PAYLOAD_CHARS);
  const check = compact.slice(PREFIX.length + PAYLOAD_CHARS);
  if (check !== encodeCheck(checksum(payload))) {
    throw new SyncCodeFormatError("sync code failed its check — look for a typo");
  }
  const seed = new Uint8Array(SEED_BYTES);
  let bits = 0;
  let acc = 0;
  let index = 0;
  for (const char of payload) {
    acc = (acc << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      seed[index++] = (acc >> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return seed;
}

/**
 * Does this input MEAN to be a sync code, as opposed to a legacy passphrase?
 * Deliberately looser than parseSyncCode: a mistyped code should be reported
 * as a bad code, not silently tried as a passphrase and blamed on "no group
 * found". The length floor keeps short passphrases that happen to start with
 * "c3" out of the code path.
 */
export function looksLikeSyncCode(input: string): boolean {
  const compact = normalize(input);
  return compact.startsWith(PREFIX) && compact.length >= 24;
}

function normalize(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

function checksum(payload: string): number {
  let value = 0;
  for (const char of payload) {
    const v = ALPHABET.indexOf(char);
    if (v < 0) throw new SyncCodeFormatError("sync code contains an invalid character");
    value = (value * 32 + v) % CHECK_MODULUS;
  }
  return value;
}

function encodeCheck(value: number): string {
  return ALPHABET[Math.floor(value / 32)] + ALPHABET[value % 32];
}
