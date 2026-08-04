#!/usr/bin/env node
/**
 * Cross-runtime vault-crypto vector check (Phase 5.2 — see
 * docs/mobile-build-phase-plan.md §2 blocker #3 / §5 step 2).
 *
 * This does NOT touch react-native-quick-crypto or react-native-argon2 —
 * it can't, there's no Hermes runtime in this sandbox. What it verifies is
 * the *algorithm and wire-format design* shared by
 * apps/web/src/lib/vault/crypto.ts and apps/mobile/src/lib/vault/crypto.ts:
 * Argon2id (hash-wasm, the same package both runtimes attempt first) plus
 * a spec-compliant WebCrypto implementation (Node's built-in
 * `crypto.webcrypto`, exercising the exact same AES-GCM/HKDF/wrapKey/
 * unwrapKey calls) round-trip correctly end to end. Passing here means:
 * if react-native-quick-crypto's WebCrypto polyfill is spec-compliant
 * (its own test suite + implementation-coverage doc claim AES-GCM,
 * HKDF, and wrapKey/unwrapKey support), the same code will work on
 * device. It does NOT prove the native binding itself loads/executes
 * correctly under Hermes — that's the one open item a real device/EAS
 * run still has to confirm (see the warning this prints for the Argon2id
 * fallback path).
 *
 * Run: node scripts/vault-crypto-vectors.mjs
 */

import { webcrypto as crypto } from "node:crypto";
import { argon2id } from "hash-wasm";

const AES_ALGO = "AES-GCM";
const IV_BYTES = 12;

function toBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}
function fromBase64(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function deriveKekFromSecret(secret, salt, params) {
  const raw = await argon2id({
    password: secret,
    salt,
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: "binary",
  });
  return crypto.subtle.importKey("raw", new Uint8Array(raw), AES_ALGO, false, [
    "wrapKey",
    "unwrapKey",
  ]);
}

async function deriveKekFromHighEntropySecret(secretBytes, salt, info) {
  const baseKey = await crypto.subtle.importKey("raw", secretBytes, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(info) },
    baseKey,
    { name: AES_ALGO, length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

async function generateDek() {
  return crypto.subtle.generateKey({ name: AES_ALGO, length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

async function wrapDek(dek, kek) {
  const iv = randomBytes(IV_BYTES);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, { name: AES_ALGO, iv });
  return { ciphertext: toBase64(new Uint8Array(wrapped)), iv: toBase64(iv) };
}

async function unwrapDek(payload, kek) {
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

async function encryptField(plaintext, dek) {
  const iv = randomBytes(IV_BYTES);
  const encrypted = await crypto.subtle.encrypt(
    { name: AES_ALGO, iv },
    dek,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

async function decryptField(payload, dek) {
  const decrypted = await crypto.subtle.decrypt(
    { name: AES_ALGO, iv: fromBase64(payload.iv) },
    dek,
    fromBase64(payload.ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

function packPayload(payload) {
  return `${payload.iv}:${payload.ciphertext}`;
}
function unpackPayload(packed) {
  const i = packed.indexOf(":");
  return { iv: packed.slice(0, i), ciphertext: packed.slice(i + 1) };
}

const PASSPHRASE_KDF_PARAMS = { iterations: 3, parallelism: 1, memorySize: 65536, hashLength: 32 };

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failures++;
}

async function main() {
  // 1. Passphrase-derived KEK -> wrap/unwrap DEK -> encrypt/decrypt round trip.
  const passphrase = "correct horse battery staple";
  const salt = randomBytes(16);
  const kek = await deriveKekFromSecret(passphrase, salt, PASSPHRASE_KDF_PARAMS);
  const dek = await generateDek();
  const wrapped = await wrapDek(dek, kek);
  const unwrappedDek = await unwrapDek(wrapped, kek);

  const plaintext = "42500.00 INR — rent, October";
  const packed = packPayload(await encryptField(plaintext, dek));
  const roundTrip = await decryptField(unpackPayload(packed), unwrappedDek);
  check("Argon2id KEK -> wrap/unwrap DEK -> AES-GCM round trip", roundTrip === plaintext);

  // 2. Wrong passphrase must fail to unwrap (auth tag rejects tampered/wrong key).
  const wrongKek = await deriveKekFromSecret("wrong passphrase entirely", salt, PASSPHRASE_KDF_PARAMS);
  let wrongKeyRejected = false;
  try {
    await unwrapDek(wrapped, wrongKek);
  } catch {
    wrongKeyRejected = true;
  }
  check("Wrong passphrase's KEK cannot unwrap the DEK", wrongKeyRejected);

  // 3. HKDF path (recovery code / MCP token) round trip.
  const highEntropySecret = randomBytes(32);
  const hkdfSalt = randomBytes(16);
  const hkdfKek = await deriveKekFromHighEntropySecret(highEntropySecret, hkdfSalt, "recovery-code-v1");
  const hkdfWrapped = await wrapDek(dek, hkdfKek);
  const hkdfUnwrapped = await unwrapDek(hkdfWrapped, hkdfKek);
  const hkdfRoundTrip = await decryptField(await encryptField("goal: emergency fund", hkdfUnwrapped), hkdfUnwrapped);
  check("HKDF KEK -> wrap/unwrap DEK -> AES-GCM round trip", hkdfRoundTrip === "goal: emergency fund");

  // 4. Wire format stability: a packed payload's IV half is always 16 base64
  // chars for a 12-byte IV — apps/web's decryptOrRecoverPacked backfill
  // detection depends on this exact invariant holding on every runtime.
  const { iv } = unpackPayload(packed);
  check("Packed payload IV is 16 base64 chars (12-byte IV)", iv.length === 16);

  console.log(`\n${failures === 0 ? "All vectors passed" : `${failures} vector(s) FAILED`} ` +
    "(Node built-in WebCrypto + hash-wasm — algorithm/wire-format level only; " +
    "does not exercise react-native-quick-crypto's or react-native-argon2's " +
    "actual native bindings, which still need a real device/EAS run).");
  process.exit(failures === 0 ? 0 : 1);
}

main();
