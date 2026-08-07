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
   * "create with a full contributor list" flow, or "create a participant
   * then add their contribution"). */
  id?: string;
}

/**
 * What the server actually validates: shape only, for the fields that stay
 * plaintext. `targetAmount`, every participant's `displayName`, every
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

const encryptedParticipantInputSchema = z.object({
  displayName: z.string().min(1),
});

export type EncryptedParticipantInput = z.infer<typeof encryptedParticipantInputSchema>;

const encryptedContributionInputSchema = z.object({
  participantId: z.string().uuid(),
  amount: z.string().min(1),
  contributedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

export type EncryptedContributionInput = z.infer<typeof encryptedContributionInputSchema>;

const encryptedExpenseInputSchema = z.object({
  amount: z.string().min(1),
  description: z.string().trim().max(200).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  paidByParticipantId: z.string().uuid().optional().nullable(),
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
/* Participants                                                             */
/* ----------------------------------------------------------------------- */

export async function createParticipant(
  collectionId: string,
  input: EncryptedParticipantInput,
): Promise<ActionResult> {
  const parsed = encryptedParticipantInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;

  const { data, error } = await supabase
    .from("collection_participants")
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

/** Refuses to delete a participant who has any contributions recorded —
 * removing them would silently orphan that money. The UI should surface
 * this rather than let the FK constraint reject it with a raw DB error. */
export async function deleteParticipant(
  collectionId: string,
  participantId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { count } = await supabase
    .from("collection_contributions")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", participantId)
    .is("deleted_at", null);
  if (count && count > 0) {
    return {
      ok: false,
      error: `${count} contribution${count === 1 ? "" : "s"} would be orphaned — remove those first.`,
    };
  }

  const { error } = await supabase
    .from("collection_participants")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", participantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true };
}

/** One-click "add to roster" for a pre-participants-table (legacy)
 * contribution row: creates a participant and re-points every legacy
 * contribution sharing the given decrypted name onto it. The name arrives
 * already re-encrypted for the new participant row; matching which legacy
 * rows to move happens client-side (only the browser can decrypt
 * `contributor_name` to compare), so this just takes the resolved id list. */
export async function migrateLegacyContributions(
  collectionId: string,
  input: EncryptedParticipantInput,
  contributionIds: string[],
): Promise<ActionResult> {
  const parsed = encryptedParticipantInputSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);
  if (contributionIds.length === 0) return { ok: false, error: "Nothing to migrate." };

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;

  const { data, error } = await supabase
    .from("collection_participants")
    .insert({
      collection_id: collectionId,
      user_id: userId,
      display_name: parsed.data.displayName,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const participantId = (data as { id: string }).id;

  const { error: updErr } = await supabase
    .from("collection_contributions")
    .update({ participant_id: participantId, contributor_name: null })
    .in("id", contributionIds);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/collections/${collectionId}`);
  return { ok: true, id: participantId };
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
    participant_id: v.participantId,
    amount: v.amount,
    contributed_at: v.contributedAt,
    method: v.method ?? null,
    note: v.note ?? null,
  });
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
    paid_by_participant_id: v.paidByParticipantId ?? null,
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
