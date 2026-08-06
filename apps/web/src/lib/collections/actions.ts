"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/supabase/require-user";
import { baseCurrencyFor } from "@/lib/profile/queries";
import { COLLECTION_STATUSES } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set by `createCollection` — lets Smart Entry's client-commit chain a
   * "create with a full set of contributors" prompt into the follow-up
   * `addContributor` calls without a second round trip to look the row up. */
  id?: string;
}

/**
 * What the server actually validates: shape only, for the fields that stay
 * plaintext. `targetAmount`/`payoutAmount` and every contributor's `amount`/
 * `contributorName` arrive as already-packed ciphertext — the client
 * validated the real values (positive, within range) *before* encrypting,
 * via the same schemas the UI form uses. See src/lib/collections/
 * client-actions.ts, which builds this input.
 */
const encryptedCollectionInputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  purpose: z.string().trim().max(200).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
  targetAmount: z.string().min(1).optional().nullable(),
  currency: z.string().length(3),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  status: z.enum(COLLECTION_STATUSES),
});

export type EncryptedCollectionInput = z.infer<typeof encryptedCollectionInputSchema>;

const encryptedContributorInputSchema = z.object({
  contributorName: z.string().min(1),
  amount: z.string().min(1),
  contributedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

export type EncryptedContributorInput = z.infer<typeof encryptedContributorInputSchema>;

const encryptedPayoutInputSchema = z.object({
  amount: z.string().min(1),
  payoutAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(200).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  createExpense: z.boolean(),
});

export type EncryptedPayoutInput = z.infer<typeof encryptedPayoutInputSchema>;

export async function createCollection(input: EncryptedCollectionInput): Promise<ActionResult> {
  const parsed = encryptedCollectionInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;
  const currency = await baseCurrencyFor(supabase, userId);

  const { data, error } = await supabase
    .from("collections")
    .insert({
      user_id: userId,
      title: v.title,
      purpose: v.purpose ?? null,
      icon: v.icon ?? null,
      target_amount: v.targetAmount ?? null,
      currency,
      event_date: v.eventDate ?? null,
      status: v.status,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/collections");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateCollection(
  id: string,
  input: EncryptedCollectionInput,
): Promise<ActionResult> {
  const parsed = encryptedCollectionInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;
  const v = parsed.data;

  const { error } = await supabase
    .from("collections")
    .update({
      title: v.title,
      purpose: v.purpose ?? null,
      icon: v.icon ?? null,
      target_amount: v.targetAmount ?? null,
      event_date: v.eventDate ?? null,
      status: v.status,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/collections");
  return { ok: true };
}

export async function deleteCollection(id: string): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("collections")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/collections");
  return { ok: true };
}

export async function addContributor(
  collectionId: string,
  input: EncryptedContributorInput,
): Promise<ActionResult> {
  const parsed = encryptedContributorInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;

  const { error } = await supabase.from("collection_contributions").insert({
    collection_id: collectionId,
    user_id: userId,
    contributor_name: v.contributorName,
    amount: v.amount,
    contributed_at: v.contributedAt,
    method: v.method ?? null,
    note: v.note ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/collections");
  return { ok: true };
}

export async function deleteContributor(id: string): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("collection_contributions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/collections");
  return { ok: true };
}

/** Records that the pooled money was spent — always closes the collection
 * (once it's spent, there's nothing left to collect toward). When
 * `createExpense` is true, also inserts a linked row into `expenses` so the
 * spend shows up in the user's own Transactions feed, closing the
 * collect-then-spend loop. */
export async function recordPayout(
  collectionId: string,
  input: EncryptedPayoutInput,
): Promise<ActionResult> {
  const parsed = encryptedPayoutInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;

  let payoutExpenseId: string | null = null;
  if (v.createExpense) {
    const currency = await baseCurrencyFor(supabase, userId);
    const { data, error: insErr } = await supabase
      .from("expenses")
      .insert({
        user_id: userId,
        amount: v.amount,
        currency,
        category_id: v.categoryId ?? null,
        account_id: v.accountId ?? null,
        description: null,
        note: v.note ?? null,
        spent_at: v.payoutAt,
      })
      .select("id")
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    payoutExpenseId = (data as { id: string }).id;
  }

  const { error: updErr } = await supabase
    .from("collections")
    .update({
      payout_amount: v.amount,
      payout_at: v.payoutAt,
      payout_note: v.note ?? null,
      payout_expense_id: payoutExpenseId,
      status: "closed",
    })
    .eq("id", collectionId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/collections");
  revalidatePath("/transactions");
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
