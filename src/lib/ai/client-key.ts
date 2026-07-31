"use client";

import { decryptField } from "@/lib/vault/crypto";
import { getActiveProviderKeyBlob } from "./actions";
import type { AIProviderId } from "./types";

export interface ResolvedKey {
  apiKey: string;
  provider: AIProviderId;
  model?: string;
}

/**
 * Fetches the active provider key's ciphertext and decrypts it with the
 * unlocked vault's DEK, client-side only. Shared by the Ask and Smart
 * Entry views so this decrypt-then-relay sequence isn't duplicated — see
 * docs/e2ee-path-b-plan.md "Resolved: the AI Assistant conflict".
 */
export async function resolveActiveKey(
  dek: CryptoKey,
): Promise<ResolvedKey | { error: string }> {
  const blob = await getActiveProviderKeyBlob();
  if ("error" in blob) return { error: blob.error ?? "Something went wrong." };
  if (!blob.hasKey) {
    return { error: "No active AI provider key. Add one in Settings → AI & Integrations." };
  }

  try {
    const apiKey = await decryptField(blob.wrap, dek);
    return { apiKey, provider: blob.provider, model: blob.model ?? undefined };
  } catch {
    return {
      error:
        "Couldn't decrypt your saved key — it may have been saved before encryption was enabled. Re-save it in Settings → AI & Integrations.",
    };
  }
}
