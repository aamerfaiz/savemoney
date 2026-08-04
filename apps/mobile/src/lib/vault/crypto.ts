/**
 * React Native vault cryptography — Phase 5.2 spike (see
 * docs/mobile-build-phase-plan.md §2 blocker #3 / §5 step 2). Third
 * runtime-specific duplicate of the same primitives, alongside
 * apps/web/src/lib/vault/crypto.ts (browser Web Crypto) and
 * apps/web/src/lib/mcp/server-crypto.ts (Node/server) — same precedent:
 * one deliberate implementation per runtime, never a shared abstraction
 * that papers over real API differences, verified byte-for-byte
 * interoperable via cross-runtime test vectors (see
 * scripts/vault-crypto-vectors.mjs at the repo root).
 *
 * `crypto.subtle`/`crypto.getRandomValues` come from
 * react-native-quick-crypto's `install()` (called once in index.ts,
 * before any other import) — a JSI-backed WebCrypto polyfill, confirmed
 * (via its implementation-coverage doc) to support AES-GCM encrypt/
 * decrypt, HKDF deriveKey, and wrapKey/unwrapKey, which is every Web
 * Crypto operation this module needs.
 *
 * Argon2id is the one primitive that can't just reuse hash-wasm's WASM
 * build unconditionally: Hermes only gained WebAssembly support (with
 * WASM→bytecode precompilation) as of Expo SDK 55 / RN 0.83+ (Hermes v1,
 * opt-in), so hash-wasm may or may not actually run depending on the
 * Hermes build/config a device ends up on — this repo hasn't been able
 * to verify that on a real device or emulator (no Android/iOS toolchain
 * in the build sandbox that wrote this file). `deriveArgon2Hash` below
 * tries the hash-wasm (WASM) path first and falls back to
 * `react-native-argon2` (a native Argon2 binding, no WASM involved) if
 * hash-wasm throws — e.g. "WebAssembly is not defined" on a Hermes build
 * without WASM enabled. **Whoever has device/EAS access next must run
 * this on a real Android device and confirm which path actually executes
 * — this is the one open item from the Phase 5.2 build-order step.**
 */

import { argon2id } from "hash-wasm";
import argon2Native from "react-native-argon2";

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

/** Mirrors apps/web/src/lib/vault/crypto.ts's PASSPHRASE_KDF_PARAMS exactly —
 * these values are part of the wire format (recorded per-user in
 * `vault_keys.password_kdf_params`) and must match across every runtime
 * that might derive the same user's KEK. */
export const PASSPHRASE_KDF_PARAMS: Argon2Params = {
  iterations: 3,
  parallelism: 1,
  memorySize: 65536,
  hashLength: 32,
};

/** Mirrors apps/web/src/lib/vault/crypto.ts's PIN_KDF_PARAMS exactly. */
export const PIN_KDF_PARAMS: Argon2Params = {
  iterations: 2,
  parallelism: 1,
  memorySize: 19456,
  hashLength: 32,
};

const AES_ALGO = "AES-GCM";
const IV_BYTES = 12;

function toHex(bytes: Uint8Array<ArrayBuffer>): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// react-native-quick-crypto's install() also exposes these two globals
// (no bespoke byte-loop needed the way the browser module needs one — no
// btoa/atob in Hermes, and this avoids pulling in @types/node just for
// Buffer's ambient type).
function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  return base64FromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array<ArrayBuffer>(base64ToArrayBuffer(b64));
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length) as Uint8Array<ArrayBuffer>);
}

/* ----------------------------------------------------------------------- */
/* Argon2id — WASM-first, native-fallback (the unresolved part of this      */
/* spike — see module doc comment)                                         */
/* ----------------------------------------------------------------------- */

async function deriveArgon2Hash(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  params: Argon2Params,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
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
    // (vs. SharedArrayBuffer) backing store — re-wrapping gives a definite
    // ArrayBuffer, same fix as apps/web/src/lib/vault/crypto.ts.
    return new Uint8Array(raw);
  } catch (wasmError) {
    // hash-wasm (WebAssembly) unavailable on this Hermes build — fall back
    // to the native Argon2 binding. Logged, not swallowed silently: this
    // is exactly the signal whoever runs the device spike needs to see.
    console.warn(
      "[vault/crypto] hash-wasm argon2id failed, falling back to " +
        "react-native-argon2 (native). This means Hermes on this device " +
        "does not support the WASM path:",
      wasmError,
    );
    const result = await argon2Native(secret, toHex(salt), {
      iterations: params.iterations,
      memory: params.memorySize,
      parallelism: params.parallelism,
      hashLength: params.hashLength,
      mode: "argon2id",
      saltEncoding: "hex",
    });
    return fromHex(result.rawHash);
  }
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
  const raw = await deriveArgon2Hash(secret, salt, params);
  return crypto.subtle.importKey("raw", raw, AES_ALGO, false, [
    "wrapKey",
    "unwrapKey",
  ]);
}

/** Derives a non-extractable AES-GCM key-wrapping key from an already
 * high-entropy random secret (recovery key, MCP agent token) via HKDF. */
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

export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: AES_ALGO, length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_BYTES);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, {
    name: AES_ALGO,
    iv,
  });
  return { ciphertext: toBase64(new Uint8Array<ArrayBuffer>(wrapped)), iv: toBase64(iv) };
}

export async function unwrapDek(payload: EncryptedPayload, kek: CryptoKey): Promise<CryptoKey> {
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

export async function encryptField(plaintext: string, dek: CryptoKey): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_BYTES);
  const encrypted = await crypto.subtle.encrypt(
    { name: AES_ALGO, iv },
    dek,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: toBase64(new Uint8Array<ArrayBuffer>(encrypted)), iv: toBase64(iv) };
}

export async function decryptField(payload: EncryptedPayload, dek: CryptoKey): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: AES_ALGO, iv: fromBase64(payload.iv) },
    dek,
    fromBase64(payload.ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

/* ----------------------------------------------------------------------- */
/* Single-column packing — matches apps/web's wire format exactly, so a    */
/* row encrypted on web decrypts on mobile and vice versa.                 */
/* ----------------------------------------------------------------------- */

const PACK_DELIMITER = ":";

export function packPayload(payload: EncryptedPayload): string {
  return `${payload.iv}${PACK_DELIMITER}${payload.ciphertext}`;
}

export function unpackPayload(packed: string): EncryptedPayload {
  const i = packed.indexOf(PACK_DELIMITER);
  if (i === -1) throw new Error("Malformed encrypted payload.");
  return { iv: packed.slice(0, i), ciphertext: packed.slice(i + 1) };
}

export async function encryptPacked(plaintext: string, dek: CryptoKey): Promise<string> {
  return packPayload(await encryptField(plaintext, dek));
}

export async function decryptPacked(packed: string, dek: CryptoKey): Promise<string> {
  return decryptField(unpackPayload(packed), dek);
}

export { toBase64, fromBase64 };
