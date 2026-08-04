"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/supabase/require-user";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { LOAN_TYPES } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * What the server actually validates now (Phase 3.5.4): shape only, for the
 * fields that stay plaintext. `principal`/`emi`/`remainingAmount`/
 * `extraEmi` arrive as already-packed ciphertext — the client validated the
 * real values *before* encrypting, via the same `loanInputSchema` it always
 * used. `interestRate`/`remainingMonths` stay plaintext and are still
 * server-validated. See src/lib/loans/client-actions.ts, which builds this
 * input.
 */
const encryptedLoanInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(LOAN_TYPES),
  principal: z.string().min(1),
  interestRate: z.coerce.number().min(0).max(100),
  emi: z.string().min(1),
  remainingAmount: z.string().min(1),
  remainingMonths: z.coerce.number().int().min(0).optional().nullable(),
  extraEmi: z.string().min(1).optional().nullable(),
  currency: z.string().length(3),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
});

export type EncryptedLoanInput = z.infer<typeof encryptedLoanInputSchema>;

/** `loan_payments.*` is encrypted as of Phase 3.5.4, same as the running
 * `loans.remaining_amount` balance (and `remaining_months`) it feeds.
 * Because that balance is ciphertext, the server can no longer
 * read-modify-write it or split it into interest/principal components: the
 * client computes all of that from its own already-decrypted
 * `remainingAmount`/`interestRate`, encrypts the payment amount and both
 * components, and sends the encrypted result directly. Same accepted
 * single-user concurrency tradeoff as goals' `addContribution` — see
 * docs/e2ee-path-b-plan.md 3.5.4. */
const encryptedPaymentInputSchema = z.object({
  amount: z.string().min(1),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isExtra: z.coerce.boolean().default(false),
  principalComponent: z.string().min(1),
  interestComponent: z.string().min(1),
  newRemainingAmount: z.string().min(1),
  newRemainingMonths: z.coerce.number().int().min(0).optional().nullable(),
});

export type EncryptedPaymentInput = z.infer<typeof encryptedPaymentInputSchema>;

export async function createLoan(input: EncryptedLoanInput): Promise<ActionResult> {
  const parsed = encryptedLoanInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;
  const currency = await baseCurrencyFor(supabase, userId);

  const { error } = await supabase.from("loans").insert({
    user_id: userId,
    name: v.name,
    type: v.type,
    principal: v.principal,
    interest_rate: v.interestRate,
    emi: v.emi,
    remaining_amount: v.remainingAmount,
    remaining_months: v.remainingMonths ?? null,
    extra_emi: v.extraEmi ?? null,
    currency,
    start_date: v.startDate,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/loans");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateLoan(id: string, input: EncryptedLoanInput): Promise<ActionResult> {
  const parsed = encryptedLoanInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const v = parsed.data;

  const { error } = await supabase
    .from("loans")
    .update({
      name: v.name,
      type: v.type,
      principal: v.principal,
      interest_rate: v.interestRate,
      emi: v.emi,
      remaining_amount: v.remainingAmount,
      remaining_months: v.remainingMonths ?? null,
      extra_emi: v.extraEmi ?? null,
      currency: v.currency,
      start_date: v.startDate,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/loans");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteLoan(id: string): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("loans")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/loans");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Record a payment: the interest/principal split and new balance arrive
 * pre-computed and pre-encrypted (see the schema comment above) — this just
 * persists both writes. */
export async function recordPayment(
  loanId: string,
  input: EncryptedPaymentInput,
): Promise<ActionResult> {
  const parsed = encryptedPaymentInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;

  const { error: insErr } = await supabase.from("loan_payments").insert({
    loan_id: loanId,
    user_id: userId,
    amount: v.amount,
    principal_component: v.principalComponent,
    interest_component: v.interestComponent,
    paid_on: v.paidOn,
    is_extra: v.isExtra,
  });
  if (insErr) return { ok: false, error: insErr.message };

  const { error: updErr } = await supabase
    .from("loans")
    .update({
      remaining_amount: v.newRemainingAmount,
      remaining_months: v.newRemainingMonths ?? null,
    })
    .eq("id", loanId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/loans");
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
