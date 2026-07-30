"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { investmentInputSchema, contributionInputSchema } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireUser() {
  if (!isSupabaseConfigured()) {
    return { error: "Connect Supabase (set env vars) to save investments." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };
  return { supabase, userId: user.id };
}

function parseInvestment(formData: FormData) {
  return investmentInputSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") || "stocks",
    investedAmount: formData.get("investedAmount"),
    currentValue: formData.get("currentValue"),
    monthlyContribution: emptyToNull(formData.get("monthlyContribution")),
    expectedReturn: formData.get("expectedReturn"),
    currency: formData.get("currency") || "USD",
    startDate:
      formData.get("startDate") || new Date().toISOString().slice(0, 10),
  });
}

export async function createInvestment(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseInvestment(formData);
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
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseInvestment(formData);
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
 * Record a contribution: log it and grow the holding's cost basis. When
 * `addToValue` is set (the default), the current market value rises by the
 * same amount too — a fresh buy hasn't gained or lost yet.
 */
export async function recordContribution(
  investmentId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contributionInputSchema.safeParse({
    amount: formData.get("amount"),
    addToValue:
      formData.get("addToValue") === "on" ||
      formData.get("addToValue") === "true",
    contributedAt:
      formData.get("contributedAt") || new Date().toISOString().slice(0, 10),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;

  const { data: inv, error: readErr } = await supabase
    .from("investments")
    .select("invested_amount, current_value")
    .eq("id", investmentId)
    .single();
  if (readErr || !inv) {
    return { ok: false, error: readErr?.message ?? "Investment not found." };
  }

  const { error: insErr } = await supabase
    .from("investment_contributions")
    .insert({
      investment_id: investmentId,
      user_id: userId,
      amount: v.amount,
      contributed_at: v.contributedAt,
    });
  if (insErr) return { ok: false, error: insErr.message };

  const newInvested = Number(inv.invested_amount) + v.amount;
  const newValue = Number(inv.current_value) + (v.addToValue ? v.amount : 0);

  const { error: updErr } = await supabase
    .from("investments")
    .update({ invested_amount: newInvested, current_value: newValue })
    .eq("id", investmentId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/investments");
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
