/** Mirrors apps/web/src/lib/loans/client-actions.ts: validate, encrypt
 * client-side, call the Route Handler. */

import { apiClient } from "../api/client";
import { encryptPacked } from "../vault/crypto";
import { loanInputSchema, paymentInputSchema, type LoanWithProjection } from "./types";

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

async function encryptLoan(
  raw: unknown,
  dek: CryptoKey | null,
): Promise<{ input: import("@savemoney/api-client").EncryptedLoanInput } | { errorResult: FormResult }> {
  const parsed = loanInputSchema.safeParse(raw);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };
  if (!dek) return { errorResult: { ok: false, error: "Unlock your vault first." } };

  const v = parsed.data;
  const [principal, emi, remainingAmount, extraEmi] = await Promise.all([
    encryptPacked(String(v.principal), dek),
    encryptPacked(String(v.emi), dek),
    encryptPacked(String(v.remainingAmount), dek),
    v.extraEmi != null ? encryptPacked(String(v.extraEmi), dek) : Promise.resolve(null),
  ]);

  return {
    input: {
      name: v.name,
      type: v.type,
      principal,
      interestRate: v.interestRate,
      emi,
      remainingAmount,
      remainingMonths: v.remainingMonths ?? null,
      extraEmi,
      currency: v.currency,
      startDate: v.startDate,
    },
  };
}

export async function createLoan(raw: unknown, dek: CryptoKey | null): Promise<FormResult> {
  const result = await encryptLoan(raw, dek);
  if ("errorResult" in result) return result.errorResult;
  return apiClient.loans.create(result.input);
}

export async function updateLoan(id: string, raw: unknown, dek: CryptoKey | null): Promise<FormResult> {
  const result = await encryptLoan(raw, dek);
  if ("errorResult" in result) return result.errorResult;
  return apiClient.loans.update(id, result.input);
}

export async function deleteLoan(id: string): Promise<FormResult> {
  return apiClient.loans.delete(id);
}

/** `loan` carries the already-decrypted balance/rate the screen was
 * rendered with — same reasoning as web's version: the interest/principal
 * split and new balance are computed here, not on the server, since it
 * can't read the stored ciphertext to do that arithmetic itself. Mirrors
 * the split exactly. */
export async function recordPayment(
  loan: LoanWithProjection,
  raw: unknown,
  dek: CryptoKey | null,
): Promise<FormResult> {
  const parsed = paymentInputSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  if (!dek) return { ok: false, error: "Unlock your vault first." };
  const v = parsed.data;

  const balance = loan.remainingAmount;
  const monthlyRate = loan.interestRate / 100 / 12;
  const interestComponentValue = v.isExtra ? 0 : Math.min(v.amount, balance * monthlyRate);
  const principalComponentValue = Math.min(balance, v.amount - interestComponentValue);

  const newBalance = Math.max(0, balance - principalComponentValue);
  const newRemainingMonths =
    !v.isExtra && loan.remainingMonths != null ? Math.max(0, loan.remainingMonths - 1) : loan.remainingMonths;

  const [amount, principalComponent, interestComponent, newRemainingAmount] = await Promise.all([
    encryptPacked(String(v.amount), dek),
    encryptPacked(String(principalComponentValue), dek),
    encryptPacked(String(interestComponentValue), dek),
    encryptPacked(String(newBalance), dek),
  ]);

  return apiClient.loans.recordPayment(loan.id, {
    amount,
    paidOn: v.paidOn,
    isExtra: v.isExtra,
    principalComponent,
    interestComponent,
    newRemainingAmount,
    newRemainingMonths,
  });
}
