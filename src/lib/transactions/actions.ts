"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  transactionInputSchema,
  type TransactionKind,
} from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parse(formData: FormData) {
  const raw = {
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "USD",
    date: formData.get("date"),
    categoryId: emptyToNull(formData.get("categoryId")),
    accountId: emptyToNull(formData.get("accountId")),
    description: emptyToNull(formData.get("description")),
    isRecurring: formData.get("isRecurring") === "on" || formData.get("isRecurring") === "true",
    frequency: formData.get("frequency") || "one_time",
    sourceType: formData.get("sourceType") || undefined,
    note: emptyToNull(formData.get("note")),
  };
  return transactionInputSchema.safeParse(raw);
}

async function requireUser() {
  if (!isSupabaseConfigured()) {
    return { error: "Connect Supabase (set env vars) to save transactions." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };
  return { supabase, userId: user.id };
}

/** Create an income or expense row. */
export async function createTransaction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parse(formData);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;

  const common = {
    user_id: userId,
    amount: v.amount,
    currency: v.currency,
    description: v.description ?? null,
    category_id: v.categoryId ?? null,
    account_id: v.accountId ?? null,
    is_recurring: v.isRecurring,
    frequency: v.frequency,
  };

  const { error } =
    v.kind === "income"
      ? await supabase.from("income").insert({
          ...common,
          received_at: v.date,
          source_type: v.sourceType ?? "other",
        })
      : await supabase.from("expenses").insert({
          ...common,
          spent_at: v.date,
          note: v.note ?? null,
        });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Update an existing row. Needs the id + kind to target the right table. */
export async function updateTransaction(
  id: string,
  kind: TransactionKind,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parse(formData);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const v = parsed.data;

  const common = {
    amount: v.amount,
    currency: v.currency,
    description: v.description ?? null,
    category_id: v.categoryId ?? null,
    account_id: v.accountId ?? null,
    is_recurring: v.isRecurring,
    frequency: v.frequency,
  };

  const { error } =
    kind === "income"
      ? await supabase
          .from("income")
          .update({ ...common, received_at: v.date, source_type: v.sourceType ?? "other" })
          .eq("id", id)
      : await supabase
          .from("expenses")
          .update({ ...common, spent_at: v.date, note: v.note ?? null })
          .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Soft-delete (sets deleted_at) — never a hard delete, per the audit spec. */
export async function deleteTransaction(
  id: string,
  kind: TransactionKind,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from(kind === "income" ? "income" : "expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/transactions");
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
