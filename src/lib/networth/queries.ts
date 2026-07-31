import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SnapshotSummary } from "./types";

/** Recent persisted snapshots, newest first. Shared with the dashboard. */
export async function fetchNetWorthSnapshots(
  supabase: SupabaseClient,
): Promise<SnapshotSummary[]> {
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
      total_assets: string | number;
      total_liabilities: string | number;
      net_worth: string | number;
      note: string | null;
    }[]
  ).map((s) => ({
    id: s.id,
    capturedAt: s.captured_at,
    totalAssets: Number(s.total_assets),
    totalLiabilities: Number(s.total_liabilities),
    netWorth: Number(s.net_worth),
    note: s.note,
  }));
}
