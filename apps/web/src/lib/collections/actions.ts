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
  /** Set by create actions that need to be chained (e.g. Smart Entry's
   * "create with a full contributor list" flow, or "create a contributor
   * then add their contribution"). */
  id?: string;
}

/**
 * What the server actually validates: shape only, for the fields that stay
 * plaintext. `targetAmount`, every contributor's `displayName`, every
 * contribution's `amount`, and every expense's `amount`/`description`
 * arrive as already-packed ciphertext — the client validated the real
 * values before encrypting, via the same schemas the UI form uses. See
 * src/lib/collections/client-actions.ts, which builds this input.
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
  displayName: z.string().min(1),
});

export type EncryptedContributorInput = z.infer<typeof encryptedContributorInputSchema>;

const encryptedContributionInputSchema = z.object({
  contributorId: z.string().uuid(),
  amount: z.string().min(1),
  contributedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

export type EncryptedContributionInput = z.infer<typeof encryptedContributionInputSchema>;

const encryptedContributionEditInputSchema = z.object({
  amount: z.string().min(1).optional(),
  contributedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  method: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

export type EncryptedContributionEditInput = z.infer<typeof encryptedContributionEditInputSchema>;

const encryptedExpenseInputSchema = z.object({
  amount: z.string().min(1),
  description: z.string().trim().max(200).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  paidByContributorId: z.string().uuid().optional().nullable(),
  spentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linkToTransaction: z.boolean(),
  accountId: z.string().uuid().optional().nullable(),
});

export type EncryptedExpenseInput = z.infer<typeof encryptedExpenseInputSchema>;

/* ----------------------------------------------------------------------- */
/* Collections                                                              */
/* ----------------------------------------------------------------------- */

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
  revalidatePath(`/collections/${id}`);
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

/* ----------------------------------------------------------------------- */
/* Contributors (the roster)                                               */
/* ----------------------------------------------------------------------- */

export async function createContributor(
  collectionId: string,
  input: EncryptedContributorInput,
): Promise<ActionResult> {
  const parsed = encryptedContributorInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;

  const { data, error } = await supabase
    .from("collection_contributors")
    .insert({
      collection_id: collectionId,
      user_id: userId,
      display_name: parsed.data.displayName,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true, id: (data as { id: string }).id };
}

/** Refuses to delete a contributor who has any contributions recorded —
 * removing them would silently orphan that money. The UI should surface
 * this rather than let the FK constraint reject it with a raw DB error. */
export async function deleteContributor(
  collectionId: string,
  contributorId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { count } = await supabase
    .from("collection_contributions")
    .select("id", { count: "exact", head: true })
    .eq("contributor_id", contributorId)
    .is("deleted_at", null);
  if (count && count > 0) {
    return {
      ok: false,
      error: `${count} contribution${count === 1 ? "" : "s"} would be orphaned — remove those first.`,
    };
  }

  const { error } = await supabase
    .from("collection_contributors")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", contributorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

/** "Link to roster" for a pre-roster (legacy) contribution grouping: creates
 * a real contributor row and re-points every legacy contribution sharing
 * the given decrypted name onto it. The name arrives already re-encrypted
 * for the new contributor row; matching which legacy rows to move happens
 * client-side (only the browser can decrypt `contributor_name` to
 * compare), so this just takes the resolved id list. */
export async function linkLegacyContributions(
  collectionId: string,
  input: EncryptedContributorInput,
  contributionIds: string[],
): Promise<ActionResult> {
  const parsed = encryptedContributorInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  if (contributionIds.length === 0) return { ok: false, error: "Nothing to link." };

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;

  const { data, error } = await supabase
    .from("collection_contributors")
    .insert({
      collection_id: collectionId,
      user_id: userId,
      display_name: parsed.data.displayName,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const contributorId = (data as { id: string }).id;

  const { error: updErr } = await supabase
    .from("collection_contributions")
    .update({ contributor_id: contributorId, contributor_name: null })
    .in("id", contributionIds);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true, id: contributorId };
}

/* ----------------------------------------------------------------------- */
/* Contributions                                                            */
/* ----------------------------------------------------------------------- */

export async function addContribution(
  collectionId: string,
  input: EncryptedContributionInput,
): Promise<ActionResult> {
  const parsed = encryptedContributionInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;

  const { error } = await supabase.from("collection_contributions").insert({
    collection_id: collectionId,
    user_id: userId,
    contributor_id: v.contributorId,
    amount: v.amount,
    contributed_at: v.contributedAt,
    method: v.method ?? null,
    note: v.note ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

/** Edits an existing contribution's amount/date/method — every field
 * optional, only what's provided changes. Lets a mistyped amount be fixed
 * in place instead of forcing a delete-and-re-add. */
export async function updateContribution(
  collectionId: string,
  id: string,
  input: EncryptedContributionEditInput,
): Promise<ActionResult> {
  const parsed = encryptedContributionEditInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const patch: Record<string, unknown> = {};
  if (v.amount !== undefined) patch.amount = v.amount;
  if (v.contributedAt !== undefined) patch.contributed_at = v.contributedAt;
  if (v.method !== undefined) patch.method = v.method ?? null;
  if (v.note !== undefined) patch.note = v.note ?? null;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase.from("collection_contributions").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

export async function deleteContribution(
  collectionId: string,
  id: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("collection_contributions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

/* ----------------------------------------------------------------------- */
/* Expenses                                                                 */
/* ----------------------------------------------------------------------- */

/** Records money spent out of a collection's pool. When `linkToTransaction`
 * is set, also inserts a linked row into `expenses` so the spend shows up
 * in the user's own Transactions feed — optional per expense, since not
 * every pool spend was fronted by the organizer's own money. */
export async function addExpense(
  collectionId: string,
  input: EncryptedExpenseInput,
): Promise<ActionResult> {
  const parsed = encryptedExpenseInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const v = parsed.data;

  let linkedTransactionId: string | null = null;
  if (v.linkToTransaction) {
    const currency = await baseCurrencyFor(supabase, userId);
    const { data, error: insErr } = await supabase
      .from("expenses")
      .insert({
        user_id: userId,
        amount: v.amount,
        currency,
        category_id: v.categoryId ?? null,
        account_id: v.accountId ?? null,
        description: v.description ?? null,
        note: null,
        spent_at: v.spentAt,
      })
      .select("id")
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    linkedTransactionId = (data as { id: string }).id;
  }

  const { error } = await supabase.from("collection_expenses").insert({
    collection_id: collectionId,
    user_id: userId,
    amount: v.amount,
    description: v.description ?? null,
    category_id: v.categoryId ?? null,
    paid_by_contributor_id: v.paidByContributorId ?? null,
    spent_at: v.spentAt,
    linked_transaction_id: linkedTransactionId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/collections/${collectionId}`);
  revalidatePath("/transactions");
  return { ok: true };
}

export async function deleteExpense(collectionId: string, id: string): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("collection_expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/collections/${collectionId}`);
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
