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
  createContributor,
  linkLegacyContributions,
  addContribution,
  updateContribution,
  addExpense,
  addTripExpense,
  addSettlement,
  type ActionResult,
  type EncryptedCollectionInput,
  type EncryptedContributorInput,
  type EncryptedContributionInput,
  type EncryptedContributionEditInput,
  type EncryptedExpenseInput,
  type EncryptedTripExpenseInput,
  type EncryptedSettlementInput,
} from "./actions";
import {
  collectionInputSchema,
  contributorInputSchema,
  contributionInputSchema,
  contributionEditInputSchema,
  expenseInputSchema,
  tripExpenseInputSchema,
  settlementInputSchema,
  type CollectionStatus,
  type CollectionWithProgress,
  type TripExpenseInput,
  type SettlementInput,
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
    type: formData.get("type") || "pool",
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
      type: v.type,
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
    // updateCollection ignores this either way (type is immutable after
    // create) — included only to satisfy EncryptedCollectionInput's shape.
    type: current.type,
  };
  return updateCollection(current.id, input);
}

/* ----------------------------------------------------------------------- */
/* Contributors (the roster)                                               */
/* ----------------------------------------------------------------------- */

export async function encryptedCreateContributor(
  dek: CryptoKey,
  collectionId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contributorInputSchema.safeParse({
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const displayName = await encryptPacked(parsed.data.displayName, dek);
  const input: EncryptedContributorInput = { displayName };
  return createContributor(collectionId, input);
}

export async function encryptedLinkLegacyContributions(
  dek: CryptoKey,
  collectionId: string,
  displayName: string,
  contributionIds: string[],
): Promise<ActionResult> {
  const parsed = contributorInputSchema.safeParse({ displayName });
  if (!parsed.success) return fieldErrors(parsed.error);

  const encryptedName = await encryptPacked(parsed.data.displayName, dek);
  return linkLegacyContributions(collectionId, { displayName: encryptedName }, contributionIds);
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
    contributorId: formData.get("contributorId"),
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
    contributorId: v.contributorId,
    amount,
    contributedAt: v.contributedAt,
    method: v.method ?? null,
    note,
  };
  return addContribution(collectionId, input);
}

/** Edits an existing contribution's amount/date/method — everything the
 * caller doesn't include in `fields` stays untouched server-side. */
export async function encryptedUpdateContribution(
  dek: CryptoKey,
  collectionId: string,
  contributionId: string,
  fields: { amount?: number; contributedAt?: string; method?: string | null },
): Promise<ActionResult> {
  const parsed = contributionEditInputSchema.safeParse(fields);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const input: EncryptedContributionEditInput = {
    amount: v.amount != null ? await encryptPacked(String(v.amount), dek) : undefined,
    contributedAt: v.contributedAt,
    method: v.method !== undefined ? (v.method ?? null) : undefined,
  };
  return updateContribution(collectionId, contributionId, input);
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
    paidByContributorId: emptyToNull(formData.get("paidByContributorId")),
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
    paidByContributorId: v.paidByContributorId ?? null,
    spentAt: v.spentAt,
    linkToTransaction: v.linkToTransaction,
    accountId: v.accountId ?? null,
  };
  return addExpense(collectionId, input);
}

/* ----------------------------------------------------------------------- */
/* Trip expenses (multi-payer, split) — `trip`-type collections only       */
/* ----------------------------------------------------------------------- */

/** Unlike the FormData-based forms above, `TripExpenseForm` manages payers
 * and splits as React state (a list of {contributorId, amount} rows being
 * built up interactively) rather than something that fits naturally into
 * plain form fields — so this takes the parsed shape directly, same
 * reasoning as `encryptedUpdateContribution` taking a typed `fields` object
 * instead of a FormData. */
export async function encryptedAddTripExpense(
  dek: CryptoKey,
  collectionId: string,
  fields: TripExpenseInput,
): Promise<ActionResult> {
  const parsed = tripExpenseInputSchema.safeParse(fields);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const amount = await encryptPacked(String(v.amount), dek);
  const description = v.description ? await encryptPacked(v.description, dek) : null;
  const payers = await Promise.all(
    v.payers.map(async (p) => ({
      contributorId: p.contributorId,
      amount: await encryptPacked(String(p.amount), dek),
    })),
  );
  const splits = await Promise.all(
    v.splits.map(async (s) => ({
      contributorId: s.contributorId,
      amount: await encryptPacked(String(s.amount), dek),
    })),
  );

  const input: EncryptedTripExpenseInput = {
    amount,
    description,
    categoryId: v.categoryId ?? null,
    spentAt: v.spentAt,
    payers,
    splits,
    linkToTransaction: v.linkToTransaction,
    accountId: v.accountId ?? null,
  };
  return addTripExpense(collectionId, input);
}

/* ----------------------------------------------------------------------- */
/* Settlements — `trip`-type collections only                              */
/* ----------------------------------------------------------------------- */

export async function encryptedAddSettlement(
  dek: CryptoKey,
  collectionId: string,
  fields: SettlementInput,
): Promise<ActionResult> {
  const parsed = settlementInputSchema.safeParse(fields);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const amount = await encryptPacked(String(v.amount), dek);
  const note = v.note ? await encryptPacked(v.note, dek) : null;

  const input: EncryptedSettlementInput = {
    fromContributorId: v.fromContributorId,
    toContributorId: v.toContributorId,
    amount,
    settledAt: v.settledAt,
    note,
  };
  return addSettlement(collectionId, input);
}
