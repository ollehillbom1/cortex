/**
 * End-to-end encryption for sync (issue #2).
 *
 * The sync passphrase IS the account: it deterministically derives both the
 * sync-group id (what the server files blobs under) and the AES-GCM key
 * (which the server never sees). Anyone who knows the passphrase can read
 * and write the group — document strength requirements accordingly.
 */

const LEGACY_ID_CONTEXT = "cortex-sync-id:v1:";
const LEGACY_KEY_CONTEXT = "cortex-sync-key:v1:";
const PBKDF2_ITERATIONS = 310_000;

/** v2 derivation contexts. Bumping these changes every group id. */
const V2_SALT = "cortex-sync:v2";
const V2_ID_INFO = "cortex-sync-id:v2";
const V2_KEY_INFO = "cortex-sync-key:v2";

/** v3: id and key come from a random seed (the sync code), not a passphrase. */
const V3_SALT = "cortex-sync:v3";
const V3_ID_INFO = "cortex-sync-id:v3";
const V3_KEY_INFO = "cortex-sync-key:v3";

/** Schema version of the credentials a device currently holds. */
export const CURRENT_SYNC_SCHEMA = 3;
/** The last passphrase-derived schema; credentials at or below it should upgrade. */
export const LEGACY_SYNC_SCHEMA = 2;

export const MIN_PASSPHRASE_LENGTH = 8;

export interface SyncCredentials {
  /** 64 hex chars; safe to reveal to the server. */
  groupId: string;
  /** AES-GCM key, exportable so it can be persisted locally as JWK. */
  key: CryptoKey;
}

/**
 * Derive the group id and encryption key from the passphrase.
 *
 * Both come from ONE PBKDF2 run, split with HKDF. This matters: v1 derived
 * the group id as a bare SHA-256 of the passphrase, and the server stores
 * that id as a filename. Anyone who could read the data directory — a
 * backup, a volume snapshot, the host itself — held an unsalted,
 * single-iteration hash of the household passphrase and could brute-force it
 * about 21 000x cheaper than attacking the PBKDF2 key, which made the
 * 310 000 iterations worthless. The weakest derivation sets the real cost,
 * so both outputs now sit behind the same one.
 *
 * The salt is a constant. That is inherent to the design — the passphrase is
 * the only identity and two devices must land on the same group with no
 * server round-trip — and it is not a regression: v1 salted PBKDF2 with the
 * group id, itself derived from the same passphrase. The iteration count is
 * the defence.
 */
export async function deriveCredentials(passphrase: string): Promise<SyncCredentials> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const master = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(V2_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    256,
  );

  // HKDF is cheap; the PBKDF2 work above is what an attacker must repeat per
  // guess. Separate info strings keep the id and the key independent, so
  // publishing the id says nothing about the key.
  return hkdfCredentials(master, new Uint8Array(0), V2_ID_INFO, V2_KEY_INFO);
}

/**
 * Derive v3 credentials from a random 128-bit seed (the sync code).
 *
 * No PBKDF2 stretch: stretching defends low-entropy secrets, and this one is
 * full-entropy by construction — the seed is generated, never chosen. What
 * matters is what v2 could not have: no two households can collide, and the
 * public endpoint cannot be used to test guesses against 2^128.
 */
export async function deriveCodeCredentials(seed: Uint8Array): Promise<SyncCredentials> {
  const copy = new Uint8Array(seed).buffer as ArrayBuffer;
  return hkdfCredentials(copy, new TextEncoder().encode(V3_SALT), V3_ID_INFO, V3_KEY_INFO);
}

async function hkdfCredentials(
  master: ArrayBuffer,
  salt: Uint8Array,
  idInfo: string,
  keyInfo: string,
): Promise<SyncCredentials> {
  const encoder = new TextEncoder();
  const prk = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits"]);
  const expand = (info: string) =>
    crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: encoder.encode(info) },
      prk,
      256,
    );

  const [idBits, keyBits] = await Promise.all([expand(idInfo), expand(keyInfo)]);
  const key = await crypto.subtle.importKey("raw", keyBits, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
  return { groupId: toHex(new Uint8Array(idBits)), key };
}

/**
 * The v1 derivation, kept solely so an existing group can be found and
 * migrated when its passphrase is entered again. Never used for new groups.
 */
export async function deriveLegacyCredentials(passphrase: string): Promise<SyncCredentials> {
  const groupId = await sha256Hex(LEGACY_ID_CONTEXT + passphrase);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(LEGACY_KEY_CONTEXT + passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(groupId),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  return { groupId, key };
}

export interface EncryptedBlob {
  /** base64 ciphertext. */
  blob: string;
  /** base64 12-byte IV. */
  iv: string;
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { blob: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
}

/** Throws on tampering or a wrong key (AES-GCM authentication). */
export async function decryptJson<T>(key: CryptoKey, payload: EncryptedBlob): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.blob),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export async function exportKeyJwk(key: CryptoKey): Promise<string> {
  return JSON.stringify(await crypto.subtle.exportKey("jwk", key));
}

export async function importKeyJwk(jwk: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", JSON.parse(jwk), { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export function isValidGroupId(id: string): boolean {
  return /^[0-9a-f]{64}$/.test(id);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
