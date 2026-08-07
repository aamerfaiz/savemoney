"use client";

/**
 * Client-side wrappers that validate + encrypt before calling the real
 * Server Actions. Forms bind these instead of the raw actions in
 * ./actions.ts directly — same shape `useActionState` needs. Mirrors
 * src/lib/goals/client-actions.ts.
 */

import { encryptPacked } from "@/lib/vault/crypto";
import {
  createCollection,
  updateCollection,
  createParticipant,
  migrateLegacyContributions,
  addContribution,
  addExpense,
  type ActionResult,
  type EncryptedCollectionInput,
  type EncryptedParticipantInput,
  type EncryptedContributionInput,
  type EncryptedExpenseInput,
} from "./actions";
import {
  collectionInputSchema,
  participantInputSchema,
  contributionInputSchema,
  expenseInputSchema,
  type CollectionStatus,
  type CollectionWithProgress,
} from "./types";

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

/* ----------------------------------------------------------------------- */
/* Collections                                                              */
/* ----------------------------------------------------------------------- */

function parseCollectionForm(formData: FormData) {
  const raw = {
    title: formData.get("title"),
    purpose: emptyToNull(formData.get("purpose")),
    icon: emptyToNull(formData.get("icon")),
    targetAmount: emptyToNull(formData.get("targetAmount")),
    currency: formData.get("currency") || "USD",
    eventDate: emptyToNull(formData.get("eventDate")),
    status: formData.get("status") || "open",
  };
  return collectionInputSchema.safeParse(raw);
}

async function encryptCollection(
  formData: FormData,
  dek: CryptoKey,
): Promise<{ input: EncryptedCollectionInput } | { errorResult: ActionResult }> {
  const parsed = parseCollectionForm(formData);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };

  const v = parsed.data;
  const targetAmount =
    v.targetAmount != null ? await encryptPacked(String(v.targetAmount), dek) : null;

  return {
    input: {
      title: v.title,
      purpose: v.purpose ?? null,
      icon: v.icon ?? null,
      targetAmount,
      currency: v.currency,
      eventDate: v.eventDate ?? null,
      status: v.status,
    },
  };
}

export async function encryptedCreateCollection(
  dek: CryptoKey,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encryptCollection(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return createCollection(result.input);
}

export async function encryptedUpdateCollection(
  dek: CryptoKey,
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encryptCollection(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return updateCollection(id, result.input);
}

/** Merge-edit for Smart Entry's `collection.edit` capability (see
 * definitions.ts) — takes only the fields the user's prompt actually
 * mentioned (everything else `undefined`) and merges them onto `current`,
 * the already-decrypted row `client-commit.ts` looked up. Bypasses the
 * FormData-based `encryptedUpdateCollection` above: that wrapper always
 * writes every field, which would silently null out anything the prompt
 * didn't mention. */
export async function encryptedEditCollectionFields(
  dek: CryptoKey,
  current: CollectionWithProgress,
  fields: {
    title?: string;
    purpose?: string | null;
    icon?: string | null;
    targetAmount?: number | null;
    eventDate?: string | null;
    status?: CollectionStatus;
  },
): Promise<ActionResult> {
  const targetAmount =
    fields.targetAmount !== undefined ? fields.targetAmount : current.targetAmount;
  const targetAmountEnc =
    targetAmount != null ? await encryptPacked(String(targetAmount), dek) : null;

  const input: EncryptedCollectionInput = {
    title: fields.title ?? current.title,
    purpose: fields.purpose !== undefined ? fields.purpose : current.purpose,
    icon: fields.icon !== undefined ? fields.icon : current.icon,
    targetAmount: targetAmountEnc,
    currency: current.currency,
    eventDate: fields.eventDate !== undefined ? fields.eventDate : current.eventDate,
    status: fields.status ?? current.status,
  };
  return updateCollection(current.id, input);
}

/* ----------------------------------------------------------------------- */
/* Participants                                                             */
/* ----------------------------------------------------------------------- */

export async function encryptedCreateParticipant(
  dek: CryptoKey,
  collectionId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = participantInputSchema.safeParse({
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const displayName = await encryptPacked(parsed.data.displayName, dek);
  const input: EncryptedParticipantInput = { displayName };
  return createParticipant(collectionId, input);
}

export async function encryptedMigrateLegacyContributions(
  dek: CryptoKey,
  collectionId: string,
  displayName: string,
  contributionIds: string[],
): Promise<ActionResult> {
  const parsed = participantInputSchema.safeParse({ displayName });
  if (!parsed.success) return fieldErrors(parsed.error);

  const encryptedName = await encryptPacked(parsed.data.displayName, dek);
  return migrateLegacyContributions(
    collectionId,
    { displayName: encryptedName },
    contributionIds,
  );
}

/* ----------------------------------------------------------------------- */
/* Contributions                                                            */
/* ----------------------------------------------------------------------- */

export async function encryptedAddContribution(
  dek: CryptoKey,
  collectionId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contributionInputSchema.safeParse({
    participantId: formData.get("participantId"),
    amount: formData.get("amount"),
    contributedAt:
      formData.get("contributedAt") || new Date().toISOString().slice(0, 10),
    method: emptyToNull(formData.get("method")),
    note: emptyToNull(formData.get("note")),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const amount = await encryptPacked(String(v.amount), dek);
  const note = v.note ? await encryptPacked(v.note, dek) : null;

  const input: EncryptedContributionInput = {
    participantId: v.participantId,
    amount,
    contributedAt: v.contributedAt,
    method: v.method ?? null,
    note,
  };
  return addContribution(collectionId, input);
}

/* ----------------------------------------------------------------------- */
/* Expenses                                                                 */
/* ----------------------------------------------------------------------- */

export async function encryptedAddExpense(
  dek: CryptoKey,
  collectionId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = expenseInputSchema.safeParse({
    amount: formData.get("amount"),
    description: emptyToNull(formData.get("description")),
    categoryId: emptyToNull(formData.get("categoryId")),
    paidByParticipantId: emptyToNull(formData.get("paidByParticipantId")),
    spentAt: formData.get("spentAt") || new Date().toISOString().slice(0, 10),
    linkToTransaction: formData.get("linkToTransaction") === "true",
    accountId: emptyToNull(formData.get("accountId")),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const amount = await encryptPacked(String(v.amount), dek);
  const description = v.description ? await encryptPacked(v.description, dek) : null;

  const input: EncryptedExpenseInput = {
    amount,
    description,
    categoryId: v.categoryId ?? null,
    paidByParticipantId: v.paidByParticipantId ?? null,
    spentAt: v.spentAt,
    linkToTransaction: v.linkToTransaction,
    accountId: v.accountId ?? null,
  };
  return addExpense(collectionId, input);
}
