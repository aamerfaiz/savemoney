"use client";

/**
 * Client-side wrappers that validate + encrypt before calling the real
 * Server Actions (Phase 3.5.4). `recurring-form.tsx` binds these instead of
 * `createRecurringRule`/`updateRecurringRule` directly — same shape
 * `useActionState` needs. Mirrors src/lib/budgets/client-actions.ts.
 */

import { encryptPacked } from "@/lib/vault/crypto";
import {
  createRecurringRule,
  updateRecurringRule,
  type ActionResult,
  type EncryptedRecurringInput,
} from "./actions";
import { recurringInputSchema } from "./types";

function parseRuleForm(formData: FormData) {
  return recurringInputSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind") || "expense",
    categoryId: emptyToNull(formData.get("categoryId")),
    accountId: emptyToNull(formData.get("accountId")),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "USD",
    frequency: formData.get("frequency") || "monthly",
    interval: formData.get("interval") || 1,
    startDate:
      formData.get("startDate") || new Date().toISOString().slice(0, 10),
    endDate: emptyToNull(formData.get("endDate")),
    isActive: formData.get("isActive") !== "false",
    note: emptyToNull(formData.get("note")),
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

async function encryptRule(
  formData: FormData,
  dek: CryptoKey,
): Promise<{ input: EncryptedRecurringInput } | { errorResult: ActionResult }> {
  const parsed = parseRuleForm(formData);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };

  const v = parsed.data;
  const amount = await encryptPacked(String(v.amount), dek);

  return {
    input: {
      name: v.name,
      kind: v.kind,
      categoryId: v.categoryId ?? null,
      accountId: v.accountId ?? null,
      amount,
      currency: v.currency,
      frequency: v.frequency,
      interval: v.interval,
      startDate: v.startDate,
      endDate: v.endDate ?? null,
      isActive: v.isActive,
      note: v.note ?? null,
    },
  };
}

export async function encryptedCreateRecurringRule(
  dek: CryptoKey,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encryptRule(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return createRecurringRule(result.input);
}

export async function encryptedUpdateRecurringRule(
  dek: CryptoKey,
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encryptRule(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return updateRecurringRule(id, result.input);
}
