/**
 * Mirrors apps/web/src/lib/transactions/client-actions.ts: validate with
 * the same Zod schema, encrypt client-side, then call the Route Handler
 * instead of a Server Action.
 */

import { apiClient } from "../api/client";
import { encryptPacked } from "../vault/crypto";
import { transactionInputSchema, type TransactionKind } from "./types";

export interface FormResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrors(err: import("zod").ZodError): FormResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
}

async function encrypt(
  raw: unknown,
  dek: CryptoKey | null,
): Promise<{ input: import("@savemoney/api-client").EncryptedTransactionInput } | { errorResult: FormResult }> {
  const parsed = transactionInputSchema.safeParse(raw);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };
  if (!dek) return { errorResult: { ok: false, error: "Unlock your vault first." } };

  const v = parsed.data;
  const amount = await encryptPacked(String(v.amount), dek);
  const description = v.description ? await encryptPacked(v.description, dek) : null;
  const note = v.kind === "expense" && v.note ? await encryptPacked(v.note, dek) : null;

  return {
    input: {
      kind: v.kind,
      amount,
      currency: v.currency,
      date: v.date,
      categoryId: v.categoryId ?? null,
      accountId: v.accountId ?? null,
      description,
      isRecurring: v.isRecurring,
      frequency: v.frequency,
      sourceType: v.sourceType,
      note,
    },
  };
}

export async function createTransaction(
  raw: unknown,
  dek: CryptoKey | null,
): Promise<FormResult> {
  const result = await encrypt(raw, dek);
  if ("errorResult" in result) return result.errorResult;
  return apiClient.transactions.create(result.input);
}

export async function updateTransaction(
  id: string,
  raw: unknown,
  dek: CryptoKey | null,
): Promise<FormResult> {
  const result = await encrypt(raw, dek);
  if ("errorResult" in result) return result.errorResult;
  return apiClient.transactions.update(id, result.input);
}

export async function deleteTransaction(id: string, kind: TransactionKind): Promise<FormResult> {
  if (kind === "transfer") {
    return { ok: false, error: "Goal contributions can't be deleted from Transactions." };
  }
  return apiClient.transactions.delete(id, kind);
}
