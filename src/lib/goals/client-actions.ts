"use client";

/**
 * Client-side wrappers that validate + encrypt before calling the real
 * Server Actions (Phase 3.5.4). `goal-form.tsx`/`contribution-form.tsx` bind
 * these instead of `createGoal`/`updateGoal`/`addContribution` directly —
 * same shape `useActionState` needs. Mirrors
 * src/lib/budgets/client-actions.ts.
 */

import { encryptPacked } from "@/lib/vault/crypto";
import {
  createGoal,
  updateGoal,
  addContribution,
  type ActionResult,
  type EncryptedGoalInput,
  type EncryptedContributionInput,
} from "./actions";
import { goalInputSchema, contributionInputSchema } from "./types";
import type { GoalWithProgress } from "./types";

function parseGoalForm(formData: FormData) {
  const raw = {
    name: formData.get("name"),
    icon: emptyToNull(formData.get("icon")),
    targetAmount: formData.get("targetAmount"),
    currentAmount: formData.get("currentAmount") || 0,
    currency: formData.get("currency") || "USD",
    deadline: emptyToNull(formData.get("deadline")),
    priority: formData.get("priority") || "medium",
    monthlyContribution: emptyToNull(formData.get("monthlyContribution")),
  };
  return goalInputSchema.safeParse(raw);
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

async function encryptGoal(
  formData: FormData,
  dek: CryptoKey,
): Promise<{ input: EncryptedGoalInput } | { errorResult: ActionResult }> {
  const parsed = parseGoalForm(formData);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };

  const v = parsed.data;
  const [targetAmount, currentAmount, monthlyContribution] = await Promise.all([
    encryptPacked(String(v.targetAmount), dek),
    encryptPacked(String(v.currentAmount), dek),
    v.monthlyContribution != null
      ? encryptPacked(String(v.monthlyContribution), dek)
      : Promise.resolve(null),
  ]);

  return {
    input: {
      name: v.name,
      icon: v.icon ?? null,
      targetAmount,
      currentAmount,
      currency: v.currency,
      deadline: v.deadline ?? null,
      priority: v.priority,
      monthlyContribution,
      status: v.currentAmount >= v.targetAmount ? "completed" : "active",
    },
  };
}

export async function encryptedCreateGoal(
  dek: CryptoKey,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encryptGoal(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return createGoal(result.input);
}

export async function encryptedUpdateGoal(
  dek: CryptoKey,
  id: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await encryptGoal(formData, dek);
  if ("errorResult" in result) return result.errorResult;
  return updateGoal(id, result.input);
}

/** `goal` carries the already-decrypted current/target amounts the form was
 * rendered with — the new running total is computed from those, not
 * re-fetched, since the server can no longer read the stored ciphertext to
 * do that arithmetic itself (see the comment on `EncryptedContributionInput`
 * in actions.ts). */
export async function encryptedAddContribution(
  dek: CryptoKey,
  goal: GoalWithProgress,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contributionInputSchema.safeParse({
    amount: formData.get("amount"),
    contributedAt:
      formData.get("contributedAt") || new Date().toISOString().slice(0, 10),
    note: emptyToNull(formData.get("note")),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const newAmount = goal.currentAmount + v.amount;
  const newStatus = newAmount >= goal.targetAmount ? "completed" : "active";
  const [amount, newCurrentAmount] = await Promise.all([
    encryptPacked(String(v.amount), dek),
    encryptPacked(String(newAmount), dek),
  ]);

  const input: EncryptedContributionInput = {
    amount,
    contributedAt: v.contributedAt,
    note: v.note ?? null,
    newCurrentAmount,
    newStatus,
  };
  return addContribution(goal.id, input);
}
