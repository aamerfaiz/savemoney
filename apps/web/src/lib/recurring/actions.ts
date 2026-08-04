"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/supabase/require-user";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { RECURRING_FREQUENCIES } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * What the server actually validates now (Phase 3.5.4): shape only, for
 * the fields that stay plaintext. `amount` arrives as already-packed
 * ciphertext — the client validated the real value (positive) *before*
 * encrypting, via the same `recurringInputSchema` it always used. See
 * src/lib/recurring/client-actions.ts, which builds this input.
 */
const encryptedRecurringInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["income", "expense"]),
    categoryId: z.string().uuid().optional().nullable(),
    accountId: z.string().uuid().optional().nullable(),
    amount: z.string().min(1),
    currency: z.string().length(3),
    frequency: z.enum(RECURRING_FREQUENCIES),
    interval: z.coerce.number().int().min(1).max(365),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    isActive: z.boolean(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "End date can't be before the start date",
    path: ["endDate"],
  });

export type EncryptedRecurringInput = z.infer<typeof encryptedRecurringInputSchema>;

function revalidate() {
  revalidatePath("/recurring");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

export async function createRecurringRule(
  input: EncryptedRecurringInput,
): Promise<ActionResult> {
  const parsed = encryptedRecurringInputSchema.safeParse(input);
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
  input: EncryptedRecurringInput,
): Promise<ActionResult> {
  const parsed = encryptedRecurringInputSchema.safeParse(input);
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
