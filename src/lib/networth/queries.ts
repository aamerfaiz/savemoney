import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Packed-ciphertext row straight off the `net_worth_snapshots` table (Phase
 * 3.5.4, see docs/e2ee-path-b-plan.md) — `totalAssets`/`totalLiabilities`/
 * `netWorth` need the vault DEK to read, so no `Number()` conversion
 * happens here anymore. See src/lib/finance/decrypt.ts's
 * `decryptSnapshotRows`, which takes over once the client has decrypted
 * these.
 */
export interface RawSnapshotRow {
  id: string;
  capturedAt: string;
  totalAssets: string;
  totalLiabilities: string;
  netWorth: string;
  note: string | null;
}

/** Recent persisted snapshots, newest first. Shared with the dashboard. */
export async function fetchNetWorthSnapshotsRaw(
  supabase: SupabaseClient,
): Promise<RawSnapshotRow[]> {
  const { data } = await supabase
    .from("net_worth_snapshots")
    .select("id, captured_at, total_assets, total_liabilities, net_worth, note")
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .limit(24);

  return (
    (data ?? []) as {
      id: string;
      captured_at: string;
      total_assets: string;
      total_liabilities: string;
      net_worth: string;
      note: string | null;
    }[]
  ).map((s) => ({
    id: s.id,
    capturedAt: s.captured_at,
    totalAssets: s.total_assets,
    totalLiabilities: s.total_liabilities,
    netWorth: s.net_worth,
    note: s.note,
  }));
}
