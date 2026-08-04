/** Mirrors apps/web/src/lib/goals/client-actions.ts: validate, encrypt
 * client-side, call the Route Handler. */

import { apiClient } from "../api/client";
import { encryptPacked } from "../vault/crypto";
import { contributionInputSchema, goalInputSchema, type GoalWithProgress } from "./types";

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

async function encryptGoal(
  raw: unknown,
  dek: CryptoKey | null,
): Promise<{ input: import("@savemoney/api-client").EncryptedGoalInput } | { errorResult: FormResult }> {
  const parsed = goalInputSchema.safeParse(raw);
  if (!parsed.success) return { errorResult: fieldErrors(parsed.error) };
  if (!dek) return { errorResult: { ok: false, error: "Unlock your vault first." } };

  const v = parsed.data;
  const [targetAmount, currentAmount, monthlyContribution] = await Promise.all([
    encryptPacked(String(v.targetAmount), dek),
    encryptPacked(String(v.currentAmount), dek),
    v.monthlyContribution != null ? encryptPacked(String(v.monthlyContribution), dek) : Promise.resolve(null),
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

export async function createGoal(raw: unknown, dek: CryptoKey | null): Promise<FormResult> {
  const result = await encryptGoal(raw, dek);
  if ("errorResult" in result) return result.errorResult;
  return apiClient.goals.create(result.input);
}

export async function updateGoal(id: string, raw: unknown, dek: CryptoKey | null): Promise<FormResult> {
  const result = await encryptGoal(raw, dek);
  if ("errorResult" in result) return result.errorResult;
  return apiClient.goals.update(id, result.input);
}

export async function deleteGoal(id: string): Promise<FormResult> {
  return apiClient.goals.delete(id);
}

/** `goal` carries the already-decrypted current/target amounts the screen
 * was rendered with — same reasoning as web's version: the server can't
 * do this arithmetic on ciphertext. */
export async function addContribution(
  goal: GoalWithProgress,
  raw: unknown,
  dek: CryptoKey | null,
): Promise<FormResult> {
  const parsed = contributionInputSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  if (!dek) return { ok: false, error: "Unlock your vault first." };
  const v = parsed.data;

  const newAmount = goal.currentAmount + v.amount;
  const newStatus = newAmount >= goal.targetAmount ? "completed" : "active";
  const [amount, newCurrentAmount] = await Promise.all([
    encryptPacked(String(v.amount), dek),
    encryptPacked(String(newAmount), dek),
  ]);

  return apiClient.goals.addContribution(goal.id, {
    amount,
    contributedAt: v.contributedAt,
    note: v.note ?? null,
    newCurrentAmount,
    newStatus,
  });
}
