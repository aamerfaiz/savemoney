/** Mirrors apps/web/src/lib/investments/client-actions.ts: validate,
 * encrypt client-side, call the Route Handler. */

import { apiClient } from "../api/client";
import { encryptPacked } from "../vault/crypto";
import { contributionInputSchema, investmentInputSchema, type InvestmentWithProjection } from "./types";

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

async function encryptInvestment(
  raw: unknown,
  dek: CryptoKey | null,
): Promise<
  { input: import("@savemoney/api-client").EncryptedInvestmentInput } | { errorResult: FormResult }
> {
  const parsed = investmentInputSchema.safeParse(raw);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };
  if (!dek) return { errorResult: { ok: false, error: "Unlock your vault first." } };

  const v = parsed.data;
  const [investedAmount, currentValue, monthlyContribution] = await Promise.all([
    encryptPacked(String(v.investedAmount), dek),
    encryptPacked(String(v.currentValue), dek),
    v.monthlyContribution != null ? encryptPacked(String(v.monthlyContribution), dek) : Promise.resolve(null),
  ]);

  return {
    input: {
      name: v.name,
      type: v.type,
      investedAmount,
      currentValue,
      monthlyContribution,
      expectedReturn: v.expectedReturn,
      currency: v.currency,
      startDate: v.startDate,
    },
  };
}

export async function createInvestment(raw: unknown, dek: CryptoKey | null): Promise<FormResult> {
  const result = await encryptInvestment(raw, dek);
  if ("errorResult" in result) return result.errorResult;
  return apiClient.investments.create(result.input);
}

export async function updateInvestment(
  id: string,
  raw: unknown,
  dek: CryptoKey | null,
): Promise<FormResult> {
  const result = await encryptInvestment(raw, dek);
  if ("errorResult" in result) return result.errorResult;
  return apiClient.investments.update(id, result.input);
}

export async function deleteInvestment(id: string): Promise<FormResult> {
  return apiClient.investments.delete(id);
}

/** `investment` carries the already-decrypted invested amount/current
 * value the screen was rendered with — same reasoning as goals'/loans'
 * equivalents: the server can't do this arithmetic on ciphertext. */
export async function recordContribution(
  investment: InvestmentWithProjection,
  raw: unknown,
  dek: CryptoKey | null,
): Promise<FormResult> {
  const parsed = contributionInputSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  if (!dek) return { ok: false, error: "Unlock your vault first." };
  const v = parsed.data;

  const newInvested = investment.investedAmount + v.amount;
  const newValue = investment.currentValue + (v.addToValue ? v.amount : 0);

  const [amount, newInvestedAmount, newCurrentValue] = await Promise.all([
    encryptPacked(String(v.amount), dek),
    encryptPacked(String(newInvested), dek),
    encryptPacked(String(newValue), dek),
  ]);

  return apiClient.investments.recordContribution(investment.id, {
    amount,
    addToValue: v.addToValue,
    contributedAt: v.contributedAt,
    newInvestedAmount,
    newCurrentValue,
  });
}
