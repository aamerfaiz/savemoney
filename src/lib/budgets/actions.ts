"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { budgetInputSchema } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parse(formData: FormData) {
  return budgetInputSchema.safeParse({
    categoryId: emptyToNull(formData.get("categoryId")),
    period: formData.get("period") || "monthly",
    amount: formData.get("amount"),
    currency: formData.get("currency") || "USD",
    startsOn: formData.get("startsOn") || new Date().toISOString().slice(0, 10),
  });
}

async function requireUser() {
  if (!isSupabaseConfigured()) {
    return { error: "Connect Supabase (set env vars) to save budgets." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };
  return { supabase, userId: user.id };
}

export async function createBudget(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parse(formData);
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
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parse(formData);
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
