"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { getInvestmentsData } from "@/lib/investments/queries";
import { getLoansData } from "@/lib/loans/queries";
import { computeNetWorth } from "@/lib/finance/net-worth";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Capture today's net worth as a snapshot so real history accrues. Composes
 * the live totals from investments, goals and loans, then upserts the row for
 * today (repeated captures on the same day overwrite rather than pile up).
 *
 * `goalsSavedTotal` arrives pre-computed from the caller (Phase 3.5.4) —
 * `goals.current_amount` is encrypted now, so this server-side action can no
 * longer read it itself; the client already has the decrypted total via
 * `useSideData()`. investments/loans aren't encrypted yet, so those still
 * fetch server-side as before.
 */
export async function captureSnapshot(goalsSavedTotal: number): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to sign in first." };

  const [investments, loans] = await Promise.all([
    getInvestmentsData(),
    getLoansData(),
  ]);

  const result = computeNetWorth([
    {
      key: "investments",
      label: "Investments",
      icon: "trending-up",
      amount: investments.totalValue,
      kind: "asset",
    },
    {
      key: "goals",
      label: "Goal savings",
      icon: "target",
      amount: goalsSavedTotal,
      kind: "asset",
    },
    {
      key: "loans",
      label: "Loans",
      icon: "landmark",
      amount: loans.totalRemaining,
      kind: "liability",
    },
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const currency = await baseCurrencyFor(supabase, user.id);
  const row = {
    total_assets: result.totalAssets,
    total_liabilities: result.totalLiabilities,
    net_worth: result.netWorth,
    currency,
  };

  // Overwrite today's snapshot if one already exists; otherwise insert.
  const { data: existing } = await supabase
    .from("net_worth_snapshots")
    .select("id")
    .eq("captured_at", today)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("net_worth_snapshots").update(row).eq("id", existing.id)
    : await supabase.from("net_worth_snapshots").insert({
        ...row,
        user_id: user.id,
        captured_at: today,
      });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
  return { ok: true };
}
