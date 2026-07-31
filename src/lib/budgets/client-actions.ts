"use client";

/**
 * Client-side wrappers that validate + encrypt before calling the real
 * Server Actions (Phase 3.5.4). `budget-form.tsx` binds these instead of
 * `createBudget`/`updateBudget` directly — same shape `useActionState`
 * needs. Mirrors src/lib/transactions/client-actions.ts from 3.5.3.
 */

import { encryptPacked } from "@/lib/vault/crypto";
import {
  createBudget,
  updateBudget,
  type ActionResult,
  type EncryptedBudgetInput,
} from "./actions";
import { budgetInputSchema } from "./types";

function parseForm(formData: FormData) {
  const raw = {
    categoryId: emptyToNull(formData.get("categoryId")),
    period: formData.get("period") || "monthly",
    amount: formData.get("amount"),
    currency: formData.get("currency") || "USD",
    startsOn: formData.get("startsOn") || new Date().toISOString().slice(0, 10),
  };
  return budgetInputSchema.safeParse(raw);
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
  dek: CryptoKey,
): Promise<{ input: EncryptedBudgetInput } | { errorResult: ActionResult }> {
  const parsed = parseForm(formData);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };

  const v = parsed.data;
  const amount = await encryptPacked(String(v.amount), dek);

  return {
    input: {
      categoryId: v.categoryId ?? null,
      period: v.period,
      amount,
      currency: v.currency,
      startsOn: v.startsOn,
    },
  };
}

export async function encryptedCreateBudget(
  dek: CryptoKey,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encrypt(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return createBudget(result.input);
}

export async function encryptedUpdateBudget(
  dek: CryptoKey,
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encrypt(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return updateBudget(id, result.input);
}
