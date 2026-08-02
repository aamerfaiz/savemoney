"use client";

/**
 * Client-side wrappers that validate + encrypt before calling the real
 * Server Actions (Phase 3.5.3). `transaction-form.tsx` is unaware of any of
 * this — it just binds whatever `createAction`/`updateAction` function it's
 * given to `useActionState`, exactly as before; guest mode binds the
 * IndexedDB actions directly, real mode binds these instead. Amount/length
 * validation happens here, client-side, via the same `transactionInputSchema`
 * the app always used — the server can no longer validate a value it can't
 * read once it's ciphertext.
 */

import { encryptPacked } from "@/lib/vault/crypto";
import {
  createTransaction,
  updateTransaction,
  type ActionResult,
  type EncryptedTransactionInput,
} from "./actions";
import { transactionInputSchema, type TransactionKind } from "./types";

function parseForm(formData: FormData) {
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

async function encrypt(
  formData: FormData,
  dek: CryptoKey | null,
): Promise<{ input: EncryptedTransactionInput } | { errorResult: ActionResult }> {
  const parsed = parseForm(formData);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };
  if (!dek) {
    return {
      errorResult: {
        ok: false,
        error: "Unlock your vault in Settings → Vault & Encryption first.",
      },
    };
  }

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

export async function encryptedCreateTransaction(
  dek: CryptoKey | null,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encrypt(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return createTransaction(result.input);
}

export async function encryptedUpdateTransaction(
  dek: CryptoKey | null,
  id: string,
  kind: TransactionKind,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encrypt(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return updateTransaction(id, kind, result.input);
}
