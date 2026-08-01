"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { INVESTMENT_TYPES } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * What the server actually validates now (Phase 3.5.4): shape only, for the
 * fields that stay plaintext. `investedAmount`/`currentValue`/
 * `monthlyContribution` arrive as already-packed ciphertext — the client
 * validated the real values *before* encrypting, via the same
 * `investmentInputSchema` it always used. `expectedReturn` stays plaintext
 * and is still server-validated. See
 * src/lib/investments/client-actions.ts, which builds this input.
 */
const encryptedInvestmentInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(INVESTMENT_TYPES),
  investedAmount: z.string().min(1),
  currentValue: z.string().min(1),
  monthlyContribution: z.string().min(1).optional().nullable(),
  expectedReturn: z.coerce.number().min(0).max(100),
  currency: z.string().length(3),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
});

export type EncryptedInvestmentInput = z.infer<typeof encryptedInvestmentInputSchema>;

/** `investment_contributions.amount` is encrypted as of Phase 3.5.4, same
 * as the running `invested_amount`/`current_value` balances it feeds.
 * Because those balances are ciphertext, the server can no longer
 * read-modify-write them (add this contribution to whatever's currently
 * stored): the client computes the new totals from its own already-
 * decrypted `investedAmount`/`currentValue`, encrypts the contribution
 * amount and both new totals, and sends everything directly. Same accepted
 * single-user concurrency tradeoff as goals' `addContribution`/loans'
 * `recordPayment` — see docs/e2ee-path-b-plan.md 3.5.4. */
const encryptedContributionInputSchema = z.object({
  amount: z.string().min(1),
  addToValue: z.coerce.boolean().default(true),
  contributedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  newInvestedAmount: z.string().min(1),
  newCurrentValue: z.string().min(1),
});

export type EncryptedContributionInput = z.infer<typeof encryptedContributionInputSchema>;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };
  return { supabase, userId: user.id };
}

export async function createInvestment(
  input: EncryptedInvestmentInput,
): Promise<ActionResult> {
  const parsed = encryptedInvestmentInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;
  const currency = await baseCurrencyFor(supabase, userId);

  const { error } = await supabase.from("investments").insert({
    user_id: userId,
    name: v.name,
    type: v.type,
    invested_amount: v.investedAmount,
    current_value: v.currentValue,
    monthly_contribution: v.monthlyContribution ?? null,
    expected_return: v.expectedReturn,
    currency,
    start_date: v.startDate,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateInvestment(
  id: string,
  input: EncryptedInvestmentInput,
): Promise<ActionResult> {
  const parsed = encryptedInvestmentInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const v = parsed.data;

  const { error } = await supabase
    .from("investments")
    .update({
      name: v.name,
      type: v.type,
      invested_amount: v.investedAmount,
      current_value: v.currentValue,
      monthly_contribution: v.monthlyContribution ?? null,
      expected_return: v.expectedReturn,
      currency: v.currency,
      start_date: v.startDate,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteInvestment(id: string): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("investments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Record a contribution: log it and grow the holding's cost basis. The new
 * `invested_amount`/`current_value` arrive pre-computed and pre-encrypted
 * (see the schema comment above) — this just persists both writes.
 */
export async function recordContribution(
  investmentId: string,
  input: EncryptedContributionInput,
): Promise<ActionResult> {
  const parsed = encryptedContributionInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;

  const { error: insErr } = await supabase
    .from("investment_contributions")
    .insert({
      investment_id: investmentId,
      user_id: userId,
      amount: v.amount,
      contributed_at: v.contributedAt,
    });
  if (insErr) return { ok: false, error: insErr.message };

  const { error: updErr } = await supabase
    .from("investments")
    .update({
      invested_amount: v.newInvestedAmount,
      current_value: v.newCurrentValue,
    })
    .eq("id", investmentId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/investments");
  revalidatePath("/dashboard");
  return { ok: true };
}

function fieldErrors(err: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
}
