"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { baseCurrencyFor } from "@/lib/profile/queries";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * What the server actually validates now (Phase 3.5.4): shape only.
 * `totalAssets`/`totalLiabilities`/`netWorth` arrive as already-packed
 * ciphertext — the client already has today's live net worth (`data.result`
 * in `networth-view.tsx`, composed from the same already-decrypted
 * investments/goals/loans totals `buildNetWorth()` used to render the
 * page), so it encrypts those three numbers directly instead of this
 * action recomputing them from raw component totals like it used to. See
 * src/lib/networth/client-actions.ts, which builds this input.
 */
const encryptedSnapshotInputSchema = z.object({
  totalAssets: z.string().min(1),
  totalLiabilities: z.string().min(1),
  netWorth: z.string().min(1),
});

export type EncryptedSnapshotInput = z.infer<typeof encryptedSnapshotInputSchema>;

/**
 * Capture today's net worth as a snapshot so real history accrues. Upserts
 * the row for today (repeated captures on the same day overwrite rather
 * than pile up).
 */
export async function captureSnapshot(
  input: EncryptedSnapshotInput,
): Promise<ActionResult> {
  const parsed = encryptedSnapshotInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid snapshot." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to sign in first." };

  const v = parsed.data;
  const today = new Date().toISOString().slice(0, 10);
  const currency = await baseCurrencyFor(supabase, user.id);
  const row = {
    total_assets: v.totalAssets,
    total_liabilities: v.totalLiabilities,
    net_worth: v.netWorth,
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
