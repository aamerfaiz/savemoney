"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/supabase/require-user";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { BUDGET_PERIODS } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * What the server actually validates now (Phase 3.5.4): shape only, for the
 * fields that stay plaintext. `amount` arrives as already-packed ciphertext
 * — the client validated the real value (positive, within range) *before*
 * encrypting, via the same `budgetInputSchema` it always used. See
 * src/lib/budgets/client-actions.ts, which builds this input.
 */
const encryptedBudgetInputSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  period: z.enum(BUDGET_PERIODS),
  amount: z.string().min(1),
  currency: z.string().length(3),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
});

export type EncryptedBudgetInput = z.infer<typeof encryptedBudgetInputSchema>;

export async function createBudget(input: EncryptedBudgetInput): Promise<ActionResult> {
  const parsed = encryptedBudgetInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;
  const currency = await baseCurrencyFor(supabase, userId);

  const { error } = await supabase.from("budgets").insert({
    user_id: userId,
    category_id: v.categoryId ?? null,
    period: v.period,
    amount: v.amount,
    currency,
    starts_on: v.startsOn,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/budget");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateBudget(
  id: string,
  input: EncryptedBudgetInput,
): Promise<ActionResult> {
  const parsed = encryptedBudgetInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const v = parsed.data;

  const { error } = await supabase
    .from("budgets")
    .update({
      category_id: v.categoryId ?? null,
      period: v.period,
      amount: v.amount,
      currency: v.currency,
      starts_on: v.startsOn,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/budget");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("budgets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/budget");
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
