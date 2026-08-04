/** Mirrors apps/web/src/lib/networth/client-actions.ts: encrypt the
 * already-computed, already-decrypted result and call the Route Handler. */

import { apiClient } from "../api/client";
import { encryptPacked } from "../vault/crypto";
import type { NetWorthResult } from "@savemoney/finance-engine/net-worth";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function captureSnapshot(
  result: NetWorthResult,
  dek: CryptoKey | null,
): Promise<ActionResult> {
  if (!dek) return { ok: false, error: "Unlock your vault first." };
  const [totalAssets, totalLiabilities, netWorth] = await Promise.all([
    encryptPacked(String(result.totalAssets), dek),
    encryptPacked(String(result.totalLiabilities), dek),
    encryptPacked(String(result.netWorth), dek),
  ]);

  return apiClient.netWorth.capture({ totalAssets, totalLiabilities, netWorth });
}
