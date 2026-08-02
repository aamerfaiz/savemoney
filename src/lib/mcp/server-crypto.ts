import "server-only";

/**
 * Server-side vault crypto — Phase 3.5.9, MCP agent access. This is the
 * one deliberate, documented exception to "every crypto operation in this
 * app is client-only" (see docs/e2ee-path-b-plan.md "Resolved: MCP agent
 * access"): an MCP tool call comes from a headless agent with no browser,
 * so the DEK has to be unwrapped here, transiently, per request, using
 * the token itself as the unlock credential.
 *
 * Deliberately NOT implemented by importing src/lib/vault/crypto.ts —
 * that file starts with `import "client-only"`, which throws if pulled
 * into a server module. This is a self-contained duplicate of exactly
 * the primitives this path needs (HKDF derive, AES-GCM wrap/unwrap,
 * field encrypt/decrypt, Crockford Base32 decode, SHA-256 hash), using
 * Node's global `crypto.subtle` — the same WebCrypto API the browser
 * uses, so the algorithms are bit-for-bit interoperable with whatever
 * the client wrapped. Getting any parameter here wrong (the HKDF `info`
 * string above all — it MUST be the literal string `"mcp-token-kek"`,
 * matching `agent-access-settings.tsx`'s mint-time wrap exactly) breaks
 * every MCP token silently, the same way the `"use server"` export bug
 * broke every vault action silently — verified against a real generated
 * token+wrap round-trip before trusting this, not just code review.
 */

const AES_ALGO = "AES-GCM";

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

// Node's Buffer.from()/Buffer pooling doesn't guarantee an ArrayBuffer (vs.
// SharedArrayBuffer) backing store, which newer DOM lib types now require
// for BufferSource — re-wrapping via `new Uint8Array(...)` (which always
// allocates a fresh, definite ArrayBuffer) matches vault/crypto.ts's own
// fix for the same issue.
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Must exactly match the `info` string agent-access-settings.tsx passes
 * to `deriveKekFromHighEntropySecret` when minting a token. */
export const MCP_TOKEN_KEK_INFO = "mcp-token-kek";

async function deriveTokenKek(
  tokenBytes: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", tokenBytes, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(MCP_TOKEN_KEK_INFO) },
    baseKey,
    { name: AES_ALGO, length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

async function unwrapDek(payload: EncryptedPayload, kek: CryptoKey): Promise<CryptoKey> {
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

/** Derives the token's KEK from its raw bytes + stored salt, then
 * unwraps the DEK from the stored wrap. The one function that turns a
 * bearer token into a usable, transient DEK for this request only —
 * never persisted, never cached, discarded when the request ends
 * (garbage collected once out of scope; there's no explicit "zeroing" of
 * WebCrypto key material, same limitation the client has). */
export async function unwrapDekFromToken(
  tokenBytes: Uint8Array<ArrayBuffer>,
  salt: string,
  wrap: EncryptedPayload,
): Promise<CryptoKey> {
  const kek = await deriveTokenKek(tokenBytes, fromBase64(salt));
  return unwrapDek(wrap, kek);
}

async function encryptField(plaintext: string, dek: CryptoKey): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const encrypted = await crypto.subtle.encrypt({ name: AES_ALGO, iv }, dek, new TextEncoder().encode(plaintext));
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

async function decryptField(payload: EncryptedPayload, dek: CryptoKey): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: AES_ALGO, iv: fromBase64(payload.iv) },
    dek,
    fromBase64(payload.ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

const PACK_DELIMITER = ":";

function packPayload(payload: EncryptedPayload): string {
  return `${payload.iv}${PACK_DELIMITER}${payload.ciphertext}`;
}

function unpackPayload(packed: string): EncryptedPayload {
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

/** SHA-256 of the raw token bytes, base64 — must match
 * `hashToken()` in vault/crypto.ts exactly (same algorithm, same
 * encoding), since this is how a token is looked up by its stored hash. */
export async function hashTokenBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toBase64(new Uint8Array(digest));
}

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Inverse of `base32Encode`/`generateMcpToken`'s display format in
 * vault/crypto.ts: `"fos_"` + 52 Crockford Base32 characters (no
 * dashes), decoding back to the original 32 random bytes. Tolerant of
 * the same transcription confusions (O↔0, I/L↔1) as the recovery-code
 * decoder, for the same reason — someone may have hand-copied this. */
export function decodeMcpToken(display: string): Uint8Array<ArrayBuffer> {
  const withoutPrefix = display.startsWith("fos_") ? display.slice(4) : display;
  const bytes = new Uint8Array(32);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const raw of withoutPrefix.toUpperCase()) {
    const ch = raw === "O" ? "0" : raw === "I" || raw === "L" ? "1" : raw;
    const v = CROCKFORD_ALPHABET.indexOf(ch);
    if (v === -1) continue;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (index < 32) bytes[index++] = (value >>> bits) & 0xff;
    }
  }
  return bytes;
}
