"use client";

/**
 * Client-side wrappers that validate + encrypt before calling the real
 * Server Actions. `collection-form.tsx`/`contributor-form.tsx`/
 * `payout-form.tsx` bind these instead of `createCollection`/
 * `updateCollection`/`addContributor`/`recordPayout` directly — same shape
 * `useActionState` needs. Mirrors src/lib/goals/client-actions.ts.
 */

import { encryptPacked } from "@/lib/vault/crypto";
import {
  createCollection,
  updateCollection,
  addContributor,
  recordPayout,
  type ActionResult,
  type EncryptedCollectionInput,
  type EncryptedContributorInput,
  type EncryptedPayoutInput,
} from "./actions";
import {
  collectionInputSchema,
  contributorInputSchema,
  payoutInputSchema,
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

/**
 * Merge-edit for Smart Entry's `collection.edit` capability (see
 * definitions.ts) — takes only the fields the user's prompt actually
 * mentioned (everything else `undefined`) and merges them onto `current`,
 * the already-decrypted row `client-commit.ts` looked up via
 * `useCollectionsData()`. Bypasses the FormData-based
 * `encryptedUpdateCollection` above: that wrapper always writes every
 * field, which would silently null out anything the prompt didn't mention
 * (e.g. wiping the target amount just because the user only asked to close
 * the collection) — exactly the merge-on-edit problem
 * docs/ai-smart-entry-plan.md flags as unbuilt for every other module.
 */
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

export async function encryptedAddContributor(
  dek: CryptoKey,
  collectionId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contributorInputSchema.safeParse({
    contributorName: formData.get("contributorName"),
    amount: formData.get("amount"),
    contributedAt:
      formData.get("contributedAt") || new Date().toISOString().slice(0, 10),
    method: emptyToNull(formData.get("method")),
    note: emptyToNull(formData.get("note")),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const [contributorName, amount] = await Promise.all([
    encryptPacked(v.contributorName, dek),
    encryptPacked(String(v.amount), dek),
  ]);
  const note = v.note ? await encryptPacked(v.note, dek) : null;

  const input: EncryptedContributorInput = {
    contributorName,
    amount,
    contributedAt: v.contributedAt,
    method: v.method ?? null,
    note,
  };
  return addContributor(collectionId, input);
}

export async function encryptedRecordPayout(
  dek: CryptoKey,
  collectionId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = payoutInputSchema.safeParse({
    amount: formData.get("amount"),
    payoutAt: formData.get("payoutAt") || new Date().toISOString().slice(0, 10),
    note: emptyToNull(formData.get("note")),
    categoryId: emptyToNull(formData.get("categoryId")),
    accountId: emptyToNull(formData.get("accountId")),
    createExpense: formData.get("createExpense") !== "false",
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const amount = await encryptPacked(String(v.amount), dek);
  const note = v.note ? await encryptPacked(v.note, dek) : null;

  const input: EncryptedPayoutInput = {
    amount,
    payoutAt: v.payoutAt,
    note,
    categoryId: v.categoryId ?? null,
    accountId: v.accountId ?? null,
    createExpense: v.createExpense,
  };
  return recordPayout(collectionId, input);
}
