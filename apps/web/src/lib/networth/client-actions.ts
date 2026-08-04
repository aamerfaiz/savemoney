"use client";

/**
 * Client-side wrapper that encrypts before calling the real Server Action
 * (Phase 3.5.4). `networth-view.tsx` binds this instead of `captureSnapshot`
 * directly. Mirrors src/lib/investments/client-actions.ts.
 */

import { encryptPacked } from "@/lib/vault/crypto";
import { captureSnapshot, type ActionResult } from "./actions";
import type { NetWorthResult } from "@savemoney/finance-engine/net-worth";

/** `result` is today's already-computed, already-decrypted net worth (the
 * same `data.result` the page is rendering) — encrypted here and sent as
 * the new snapshot. */
export async function encryptedCaptureSnapshot(
  dek: CryptoKey,
  result: NetWorthResult,
): Promise<ActionResult> {
  const [totalAssets, totalLiabilities, netWorth] = await Promise.all([
    encryptPacked(String(result.totalAssets), dek),
    encryptPacked(String(result.totalLiabilities), dek),
    encryptPacked(String(result.netWorth), dek),
  ]);

  return captureSnapshot({ totalAssets, totalLiabilities, netWorth });
}
