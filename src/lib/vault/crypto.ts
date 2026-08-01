/**
 * Client-side vault cryptography (Phase 3.5, E2EE "not even me" — see
 * docs/e2ee-path-b-plan.md). Runs in the browser only, via Web Crypto
 * (`crypto.subtle`) and hash-wasm's Argon2id. Mirrors the
 * `{ ciphertext, iv }` payload shape of src/lib/ai/crypto.ts, but nothing
 * here ever runs server-side and nothing here ever hands a server a
 * plaintext secret or an unwrapped key.
 *
 * Two derivation paths, chosen deliberately per secret type:
 *  - Argon2id, for low-entropy human secrets (vault passphrase, PIN) —
 *    slow on purpose, to resist offline brute force.
 *  - HKDF (native to Web Crypto), for already-high-entropy random secrets
 *    (recovery key, MCP agent token) — a slow KDF buys nothing against a
 *    uniformly random 256-bit input, so this is deliberately cheap.
 */

import "client-only";

import { argon2id } from "hash-wasm";

export interface EncryptedPayload {
  /** base64: AES-GCM ciphertext with the auth tag appended (subtle's default). */
  ciphertext: string;
  /** base64 initialization vector (12 bytes). */
  iv: string;
}

export interface Argon2Params {
  iterations: number;
  parallelism: number;
  /** Kibibytes. */
  memorySize: number;
  hashLength: number;
}

/** OWASP 2026 guidance for Argon2id (interactive, single verification):
 * t=3, m=64 MiB, p=1. Used for the vault passphrase. Recorded per-user in
 * `vault_keys.password_kdf_params` so it can be strengthened for new setups
 * without invalidating existing vaults. */
export const PASSPHRASE_KDF_PARAMS: Argon2Params = {
  iterations: 3,
  parallelism: 1,
  memorySize: 65536,
  hashLength: 32,
};

/** Lighter than the passphrase params — the PIN unlocks a *local* cache on
 * a device the user already once fully authenticated, and runs on every
 * app open, so it trades some KDF cost for responsiveness. The primary
 * defense against PIN brute force is the attempt-throttle (wipe the local
 * wrapped copy after N wrong tries) in the quick-unlock UI, not this KDF —
 * a slow KDF alone can't stop someone who extracts the raw IndexedDB file
 * and brute-forces offline, bypassing the app's own attempt counter. */
export const PIN_KDF_PARAMS: Argon2Params = {
  iterations: 2,
  parallelism: 1,
  memorySize: 19456,
  hashLength: 32,
};

const AES_ALGO = "AES-GCM";
const IV_BYTES = 12;

function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

/* ----------------------------------------------------------------------- */
/* KEK derivation                                                          */
/* ----------------------------------------------------------------------- */

/** Derives a non-extractable AES-GCM key-wrapping key from a low-entropy
 * human secret (vault passphrase or PIN) via Argon2id. */
export async function deriveKekFromSecret(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  params: Argon2Params,
): Promise<CryptoKey> {
  const raw = await argon2id({
    password: secret,
    salt,
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: "binary",
  });
  // hash-wasm's return type doesn't pin its Uint8Array to an ArrayBuffer
  // (vs. SharedArrayBuffer) backing store, which newer DOM lib types now
  // require for BufferSource — re-wrapping gives a definite ArrayBuffer.
  return crypto.subtle.importKey("raw", new Uint8Array(raw), AES_ALGO, false, [
    "wrapKey",
    "unwrapKey",
  ]);
}

/** Derives a non-extractable AES-GCM key-wrapping key from an already
 * high-entropy random secret (recovery key, MCP agent token) via HKDF —
 * no Argon2id needed, see the module doc comment above. `info` domain-
 * separates the two callers so the same raw secret bytes could never
 * accidentally derive the same key for a different purpose. */
export async function deriveKekFromHighEntropySecret(
  secretBytes: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: string,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(info) },
    baseKey,
    { name: AES_ALGO, length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/* ----------------------------------------------------------------------- */
/* DEK generation, wrap/unwrap                                             */
/* ----------------------------------------------------------------------- */

/** Generates the data-encryption key. Extractable is required by the Web
 * Crypto spec for a key to be `wrapKey`-able at all — but the raw bytes are
 * never exported by our own code; `wrapKey`/`unwrapKey` do that internally
 * in one native call, so plaintext key bytes never reach JS-visible memory
 * outside the browser's own crypto implementation. */
export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: AES_ALGO, length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function wrapDek(
  dek: CryptoKey,
  kek: CryptoKey,
): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_BYTES);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, {
    name: AES_ALGO,
    iv,
  });
  return { ciphertext: toBase64(new Uint8Array(wrapped)), iv: toBase64(iv) };
}

export async function unwrapDek(
  payload: EncryptedPayload,
  kek: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(payload.ciphertext),
    kek,
    { name: AES_ALGO, iv: fromBase64(payload.iv) },
    { name: AES_ALGO, length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/* ----------------------------------------------------------------------- */
/* Per-field encryption                                                    */
/* ----------------------------------------------------------------------- */

export async function encryptField(
  plaintext: string,
  dek: CryptoKey,
): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_BYTES);
  const encrypted = await crypto.subtle.encrypt(
    { name: AES_ALGO, iv },
    dek,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

export async function decryptField(
  payload: EncryptedPayload,
  dek: CryptoKey,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: AES_ALGO, iv: fromBase64(payload.iv) },
    dek,
    fromBase64(payload.ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

/* ----------------------------------------------------------------------- */
/* Recovery key & MCP token — human-typeable encodings of random secrets   */
/* ----------------------------------------------------------------------- */

// Crockford Base32 — excludes I, L, O, U to cut down transcription errors
// when a user is copying a shown-once code by hand.
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32Encode(bytes: Uint8Array<ArrayBuffer>): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += CROCKFORD_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function groupCode(code: string, groupSize = 5): string {
  const groups: string[] = [];
  for (let i = 0; i < code.length; i += groupSize) {
    groups.push(code.slice(i, i + groupSize));
  }
  return groups.join("-");
}

/** Inverse of `base32Encode`, tolerant of the dashes `groupCode` inserts,
 * surrounding whitespace, and the classic Crockford transcription
 * confusions (O↔0, I/L↔1) — exactly why those letters were excluded from
 * the alphabet in the first place. Stops once `byteLength` bytes are
 * decoded; a wrong/mistyped code just produces the wrong bytes, which
 * `unwrapDek` will reject with a normal decrypt failure, not a crash. */
function base32Decode(input: string, byteLength: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(byteLength);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const raw of input.toUpperCase()) {
    const ch = raw === "O" ? "0" : raw === "I" || raw === "L" ? "1" : raw;
    const v = CROCKFORD_ALPHABET.indexOf(ch);
    if (v === -1) continue; // skip dashes, whitespace, anything else
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (index < byteLength) bytes[index++] = (value >>> bits) & 0xff;
    }
  }
  return bytes;
}

/** Decodes a recovery code the user typed back into the raw bytes
 * `generateRecoveryCode` produced, so its KEK can be re-derived via
 * `deriveKekFromHighEntropySecret`. */
export function decodeRecoveryCode(display: string): Uint8Array<ArrayBuffer> {
  return base32Decode(display, 32);
}

/** Generates a one-time, shown-once recovery code: 256 bits of entropy,
 * human-typeable. Returns both the raw bytes (to derive the recovery KEK
 * immediately) and the formatted display string (to show the user once). */
export function generateRecoveryCode(): { bytes: Uint8Array<ArrayBuffer>; display: string } {
  const bytes = randomBytes(32);
  return { bytes, display: groupCode(base32Encode(bytes)) };
}

/** Generates a random MCP agent token: 256 bits of entropy. Returns the raw
 * bytes (to derive this token's KEK client-side, once, at creation) and the
 * string to hand to the user for their agent's config — never stored raw. */
export function generateMcpToken(): { bytes: Uint8Array<ArrayBuffer>; display: string } {
  const bytes = randomBytes(32);
  return { bytes, display: `fos_${groupCode(base32Encode(bytes), 8).replace(/-/g, "")}` };
}

/** SHA-256 of a token's raw bytes, for server-side lookup/rate-limiting
 * only — this hash can never be used to derive the token's KEK, so a DB
 * leak alone doesn't unlock anything. */
export async function hashToken(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toBase64(new Uint8Array(digest));
}

/* ----------------------------------------------------------------------- */
/* Single-column packing — for tables with many encrypted fields per row   */
/* (finance data), one `text` column per field beats two (ciphertext + iv) */
/* to avoid doubling column counts across a dozen tables.                  */
/* ----------------------------------------------------------------------- */

const PACK_DELIMITER = ":"; // not in the base64 alphabet — unambiguous split

export function packPayload(payload: EncryptedPayload): string {
  return `${payload.iv}${PACK_DELIMITER}${payload.ciphertext}`;
}

export function unpackPayload(packed: string): EncryptedPayload {
  const i = packed.indexOf(PACK_DELIMITER);
  if (i === -1) throw new Error("Malformed encrypted payload.");
  return { iv: packed.slice(0, i), ciphertext: packed.slice(i + 1) };
}

/** Encrypts a plaintext string straight to its packed, storable form. */
export async function encryptPacked(plaintext: string, dek: CryptoKey): Promise<string> {
  return packPayload(await encryptField(plaintext, dek));
}

/** Decrypts a packed column value back to plaintext. */
export async function decryptPacked(packed: string, dek: CryptoKey): Promise<string> {
  return decryptField(unpackPayload(packed), dek);
}

export { toBase64, fromBase64 };
