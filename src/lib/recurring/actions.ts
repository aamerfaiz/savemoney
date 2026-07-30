"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { recurringInputSchema } from "./types";

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

function parseRule(formData: FormData) {
  return recurringInputSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind") || "expense",
    categoryId: emptyToNull(formData.get("categoryId")),
    accountId: emptyToNull(formData.get("accountId")),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "USD",
    frequency: formData.get("frequency") || "monthly",
    interval: formData.get("interval") || 1,
    startDate:
      formData.get("startDate") || new Date().toISOString().slice(0, 10),
    endDate: emptyToNull(formData.get("endDate")),
    isActive: formData.get("isActive") !== "false",
    note: emptyToNull(formData.get("note")),
  });
}

function revalidate() {
  revalidatePath("/recurring");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

export async function createRecurringRule(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseRule(formData);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;
  const currency = await baseCurrencyFor(supabase, userId);

  const { error } = await supabase.from("recurring_rules").insert({
    user_id: userId,
    name: v.name,
    kind: v.kind,
    category_id: v.categoryId ?? null,
    account_id: v.accountId ?? null,
    amount: v.amount,
    currency,
    frequency: v.frequency,
    interval: v.interval,
    start_date: v.startDate,
    end_date: v.endDate ?? null,
    is_active: v.isActive,
    note: v.note ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function updateRecurringRule(
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseRule(formData);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const v = parsed.data;

  const { error } = await supabase
    .from("recurring_rules")
    .update({
      name: v.name,
      kind: v.kind,
      category_id: v.categoryId ?? null,
      account_id: v.accountId ?? null,
      amount: v.amount,
      currency: v.currency,
      frequency: v.frequency,
      interval: v.interval,
      start_date: v.startDate,
      end_date: v.endDate ?? null,
      is_active: v.isActive,
      note: v.note ?? null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

/** Pause / resume a rule without deleting it. */
export async function toggleRecurringRule(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("recurring_rules")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

export async function deleteRecurringRule(id: string): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("recurring_rules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidate();
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
