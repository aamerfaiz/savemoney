import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM envelope encryption for provider API keys at rest (Phase 3
 * BYOK — see AGENTS.md "AI providers & user API keys"). Server-only: never
 * imported by a client component, never logs plaintext.
 */

const ALGO = "aes-256-gcm";
const AUTH_TAG_LENGTH = 16;

export interface EncryptedPayload {
  /** base64: ciphertext with the GCM auth tag appended. */
  ciphertext: string;
  /** base64 initialization vector. */
  iv: string;
}

function getKey(): Buffer {
  const secret = process.env.AI_KEYS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "AI_KEYS_ENCRYPTION_KEY is not set — cannot encrypt or decrypt provider keys.",
    );
  }
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) {
    throw new Error(
      "AI_KEYS_ENCRYPTION_KEY must decode to exactly 32 bytes (a base64-encoded AES-256 key).",
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, authTag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const raw = Buffer.from(payload.ciphertext, "base64");
  const authTag = raw.subarray(raw.length - AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(0, raw.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
