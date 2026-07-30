"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { loanInputSchema, paymentInputSchema } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };
  return { supabase, userId: user.id };
}

function parseLoan(formData: FormData) {
  return loanInputSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") || "personal",
    principal: formData.get("principal"),
    interestRate: formData.get("interestRate"),
    emi: formData.get("emi"),
    remainingAmount: formData.get("remainingAmount"),
    remainingMonths: emptyToNull(formData.get("remainingMonths")),
    extraEmi: emptyToNull(formData.get("extraEmi")),
    currency: formData.get("currency") || "USD",
    startDate: formData.get("startDate") || new Date().toISOString().slice(0, 10),
  });
}

export async function createLoan(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseLoan(formData);
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

export async function updateLoan(
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseLoan(formData);
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

/**
 * Record a payment: split into interest + principal (unless flagged as an extra
 * principal-only payment), log it, and reduce the outstanding balance.
 */
export async function recordPayment(
  loanId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = paymentInputSchema.safeParse({
    amount: formData.get("amount"),
    paidOn: formData.get("paidOn") || new Date().toISOString().slice(0, 10),
    isExtra: formData.get("isExtra") === "on" || formData.get("isExtra") === "true",
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;

  const { data: loan, error: readErr } = await supabase
    .from("loans")
    .select("remaining_amount, interest_rate, remaining_months")
    .eq("id", loanId)
    .single();
  if (readErr || !loan) {
    return { ok: false, error: readErr?.message ?? "Loan not found." };
  }

  const balance = Number(loan.remaining_amount);
  const monthlyRate = Number(loan.interest_rate) / 100 / 12;
  const interestComponent = v.isExtra ? 0 : Math.min(v.amount, balance * monthlyRate);
  const principalComponent = Math.min(balance, v.amount - interestComponent);

  const { error: insErr } = await supabase.from("loan_payments").insert({
    loan_id: loanId,
    user_id: userId,
    amount: v.amount,
    principal_component: principalComponent,
    interest_component: interestComponent,
    paid_on: v.paidOn,
    is_extra: v.isExtra,
  });
  if (insErr) return { ok: false, error: insErr.message };

  const newBalance = Math.max(0, balance - principalComponent);
  const newMonths =
    !v.isExtra && loan.remaining_months != null
      ? Math.max(0, loan.remaining_months - 1)
      : loan.remaining_months;

  const { error: updErr } = await supabase
    .from("loans")
    .update({ remaining_amount: newBalance, remaining_months: newMonths })
    .eq("id", loanId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/loans");
  revalidatePath("/dashboard");
  return { ok: true };
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

function fieldErrors(err: import("zod").ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
}
