/** Mirrors apps/web/src/lib/budgets/client-actions.ts: validate with the
 * same Zod schema, encrypt client-side, then call the Route Handler. */

import { apiClient } from "../api/client";
import { encryptPacked } from "../vault/crypto";
import { budgetInputSchema } from "./types";

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
): Promise<{ input: import("@savemoney/api-client").EncryptedBudgetInput } | { errorResult: FormResult }> {
  const parsed = budgetInputSchema.safeParse(raw);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };
  if (!dek) return { errorResult: { ok: false, error: "Unlock your vault first." } };

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

export async function createBudget(raw: unknown, dek: CryptoKey | null): Promise<FormResult> {
  const result = await encrypt(raw, dek);
  if ("errorResult" in result) return result.errorResult;
  return apiClient.budgets.create(result.input);
}

export async function updateBudget(
  id: string,
  raw: unknown,
  dek: CryptoKey | null,
): Promise<FormResult> {
  const result = await encrypt(raw, dek);
  if ("errorResult" in result) return result.errorResult;
  return apiClient.budgets.update(id, result.input);
}

export async function deleteBudget(id: string): Promise<FormResult> {
  return apiClient.budgets.delete(id);
}
