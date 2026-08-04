"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/supabase/require-user";
import { baseCurrencyFor } from "@/lib/profile/queries";
import type { TransactionKind } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const frequencies = [
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
const incomeSourceTypes = [
  "salary",
  "freelance",
  "rental",
  "interest",
  "business",
  "dividend",
  "other",
] as const;

/**
 * What the server actually validates now (Phase 3.5.3): shape only, for the
 * fields that stay plaintext. `amount`/`description`/`note` arrive as
 * already-packed ciphertext strings — the client validated the real values
 * (positive amount, length limits, etc.) *before* encrypting, via the same
 * `transactionInputSchema` it always used; the server can't re-check a
 * value it can't read. See src/lib/transactions/client-actions.ts, which
 * builds this input.
 */
const encryptedTransactionInputSchema = z
  .object({
    kind: z.enum(["income", "expense"]),
    amount: z.string().min(1),
    currency: z.string().length(3).default("USD"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
    categoryId: z.string().uuid().optional().nullable(),
    accountId: z.string().uuid().optional().nullable(),
    description: z.string().min(1).optional().nullable(),
    isRecurring: z.boolean().default(false),
    frequency: z.enum(frequencies).default("one_time"),
    sourceType: z.enum(incomeSourceTypes).optional(),
    note: z.string().min(1).optional().nullable(),
  })
  .refine((v) => !v.isRecurring || v.frequency !== "one_time", {
    message: "Choose how often a recurring transaction repeats",
    path: ["frequency"],
  });

export type EncryptedTransactionInput = z.infer<typeof encryptedTransactionInputSchema>;

/** Create an income or expense row. Every secret field arrives pre-encrypted. */
export async function createTransaction(input: EncryptedTransactionInput): Promise<ActionResult> {
  const parsed = encryptedTransactionInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;
  const currency = await baseCurrencyFor(supabase, userId);

  const common = {
    user_id: userId,
    amount: v.amount,
    currency,
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
  input: EncryptedTransactionInput,
): Promise<ActionResult> {
  const parsed = encryptedTransactionInputSchema.safeParse(input);
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

/** Soft-delete (sets deleted_at) — never a hard delete, per the audit spec.
 * Untouched by encryption — no encrypted field involved. */
export async function deleteTransaction(id: string, kind: TransactionKind): Promise<ActionResult> {
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
