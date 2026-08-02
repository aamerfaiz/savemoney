"use client";

/**
 * Client-side wrappers that validate + encrypt before calling the real
 * Server Actions (Phase 3.5.4). `investment-form.tsx`/`contribution-form.tsx`
 * bind these instead of `createInvestment`/`updateInvestment`/
 * `recordContribution` directly — same shape `useActionState` needs.
 * Mirrors src/lib/loans/client-actions.ts.
 */

import { encryptPacked } from "@/lib/vault/crypto";
import {
  createInvestment,
  updateInvestment,
  recordContribution,
  type ActionResult,
  type EncryptedInvestmentInput,
  type EncryptedContributionInput,
} from "./actions";
import { investmentInputSchema, contributionInputSchema } from "./types";
import type { InvestmentWithProjection } from "./types";

function parseInvestmentForm(formData: FormData) {
  return investmentInputSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") || "stocks",
    investedAmount: formData.get("investedAmount"),
    currentValue: formData.get("currentValue"),
    monthlyContribution: emptyToNull(formData.get("monthlyContribution")),
    expectedReturn: formData.get("expectedReturn"),
    currency: formData.get("currency") || "USD",
    startDate:
      formData.get("startDate") || new Date().toISOString().slice(0, 10),
  });
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

async function encryptInvestment(
  formData: FormData,
  dek: CryptoKey,
): Promise<{ input: EncryptedInvestmentInput } | { errorResult: ActionResult }> {
  const parsed = parseInvestmentForm(formData);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };

  const v = parsed.data;
  const [investedAmount, currentValue, monthlyContribution] = await Promise.all([
    encryptPacked(String(v.investedAmount), dek),
    encryptPacked(String(v.currentValue), dek),
    v.monthlyContribution != null
      ? encryptPacked(String(v.monthlyContribution), dek)
      : Promise.resolve(null),
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

export async function encryptedCreateInvestment(
  dek: CryptoKey,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encryptInvestment(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return createInvestment(result.input);
}

export async function encryptedUpdateInvestment(
  dek: CryptoKey,
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encryptInvestment(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return updateInvestment(id, result.input);
}

/** `investment` carries the already-decrypted invested amount/current value
 * the form was rendered with — the new totals are computed from those, not
 * re-fetched, since the server can no longer read the stored ciphertext to
 * do that arithmetic itself (see the comment on `EncryptedContributionInput`
 * in actions.ts). */
export async function encryptedRecordContribution(
  dek: CryptoKey,
  investment: InvestmentWithProjection,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contributionInputSchema.safeParse({
    amount: formData.get("amount"),
    addToValue:
      formData.get("addToValue") === "on" || formData.get("addToValue") === "true",
    contributedAt:
      formData.get("contributedAt") || new Date().toISOString().slice(0, 10),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const newInvested = investment.investedAmount + v.amount;
  const newValue = investment.currentValue + (v.addToValue ? v.amount : 0);

  const [amount, newInvestedAmount, newCurrentValue] = await Promise.all([
    encryptPacked(String(v.amount), dek),
    encryptPacked(String(newInvested), dek),
    encryptPacked(String(newValue), dek),
  ]);

  const input: EncryptedContributionInput = {
    amount,
    addToValue: v.addToValue,
    contributedAt: v.contributedAt,
    newInvestedAmount,
    newCurrentValue,
  };
  return recordContribution(investment.id, input);
}
