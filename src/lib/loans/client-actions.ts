"use client";

/**
 * Client-side wrappers that validate + encrypt before calling the real
 * Server Actions (Phase 3.5.4). `loan-form.tsx`/`payment-form.tsx` bind
 * these instead of `createLoan`/`updateLoan`/`recordPayment` directly —
 * same shape `useActionState` needs. Mirrors
 * src/lib/goals/client-actions.ts.
 */

import { encryptPacked } from "@/lib/vault/crypto";
import {
  createLoan,
  updateLoan,
  recordPayment,
  type ActionResult,
  type EncryptedLoanInput,
  type EncryptedPaymentInput,
} from "./actions";
import { loanInputSchema, paymentInputSchema } from "./types";
import type { LoanWithProjection } from "./types";

function parseLoanForm(formData: FormData) {
  return loanInputSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") || "personal",
    principal: formData.get("principal"),
    interestRate: formData.get("interestRate"),
    emi: formData.get("emi"),
    remainingAmount: formData.get("remainingAmount"),
    remainingMonths: emptyToNull(formData.get("remainingMonths")),
    extraEmi: emptyToNull(formData.get("extraEmi")),
    currency: formData.get("currency") || "USD",
    startDate: formData.get("startDate") || new Date().toISOString().slice(0, 10),
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

async function encryptLoan(
  formData: FormData,
  dek: CryptoKey,
): Promise<{ input: EncryptedLoanInput } | { errorResult: ActionResult }> {
  const parsed = parseLoanForm(formData);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };

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

export async function encryptedCreateLoan(
  dek: CryptoKey,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encryptLoan(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return createLoan(result.input);
}

export async function encryptedUpdateLoan(
  dek: CryptoKey,
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encryptLoan(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return updateLoan(id, result.input);
}

/** `loan` carries the already-decrypted balance/rate the form was rendered
 * with — the interest/principal split and new balance are computed from
 * those, not re-fetched, since the server can no longer read the stored
 * ciphertext to do that arithmetic itself (see the comment on
 * `EncryptedPaymentInput` in actions.ts). Mirrors the original server-side
 * split in loans/actions.ts exactly, just moved to run here first. */
export async function encryptedRecordPayment(
  dek: CryptoKey,
  loan: LoanWithProjection,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = paymentInputSchema.safeParse({
    amount: formData.get("amount"),
    paidOn: formData.get("paidOn") || new Date().toISOString().slice(0, 10),
    isExtra: formData.get("isExtra") === "on" || formData.get("isExtra") === "true",
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const balance = loan.remainingAmount;
  const monthlyRate = loan.interestRate / 100 / 12;
  const interestComponentValue = v.isExtra ? 0 : Math.min(v.amount, balance * monthlyRate);
  const principalComponentValue = Math.min(balance, v.amount - interestComponentValue);

  const newBalance = Math.max(0, balance - principalComponentValue);
  const newRemainingMonths =
    !v.isExtra && loan.remainingMonths != null
      ? Math.max(0, loan.remainingMonths - 1)
      : loan.remainingMonths;

  const [amount, principalComponent, interestComponent, newRemainingAmount] = await Promise.all([
    encryptPacked(String(v.amount), dek),
    encryptPacked(String(principalComponentValue), dek),
    encryptPacked(String(interestComponentValue), dek),
    encryptPacked(String(newBalance), dek),
  ]);

  const input: EncryptedPaymentInput = {
    amount,
    paidOn: v.paidOn,
    isExtra: v.isExtra,
    principalComponent,
    interestComponent,
    newRemainingAmount,
    newRemainingMonths,
  };
  return recordPayment(loan.id, input);
}
