/**
 * End-to-end encryption for sync (issue #2).
 *
 * The sync passphrase IS the account: it deterministically derives both the
 * sync-group id (what the server files blobs under) and the AES-GCM key
 * (which the server never sees). Anyone who knows the passphrase can read
 * and write the group — document strength requirements accordingly.
 */

const ID_CONTEXT = "cortex-sync-id:v1:";
const KEY_CONTEXT = "cortex-sync-key:v1:";
const PBKDF2_ITERATIONS = 310_000;

export const MIN_PASSPHRASE_LENGTH = 8;

export interface SyncCredentials {
  /** 64 hex chars; safe to reveal to the server. */
  groupId: string;
  /** AES-GCM key, exportable so it can be persisted locally as JWK. */
  key: CryptoKey;
}

export async function deriveCredentials(passphrase: string): Promise<SyncCredentials> {
  const groupId = await sha256Hex(ID_CONTEXT + passphrase);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(KEY_CONTEXT + passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      // The salt only needs to differ per group; the group id serves.
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
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
