"use client";

/**
 * Client-side decryption of raw finance rows (Phase 3.5.3). Fault-tolerant
 * per row on purpose: rows encrypted under a different DEK (or, right now,
 * pre-migration rows that were never encrypted at all — see
 * docs/e2ee-path-b-plan.md 3.5.3) fail to decrypt individually rather than
 * taking down the whole list. Callers get back what could be read plus a
 * count of what couldn't, so the UI can say so instead of going blank.
 */

import { decryptPacked } from "@/lib/vault/crypto";
import type {
  RawIncomeRow,
  RawExpenseRow,
  RawBudgetRow,
  RawActiveGoalRow,
  RawLoanAmountRow,
} from "./raw-data";
import type { RawGoalRow } from "@/lib/goals/queries";
import type { RawLoanRow } from "@/lib/loans/queries";
import type { LoanType } from "@/lib/loans/types";

export interface DecryptedIncomeRow {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  accountId: string | null;
  accountName: string | null;
  receivedAt: string;
  isRecurring: boolean;
  frequency: string;
  sourceType: string | null;
}

export interface DecryptedExpenseRow {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  note: string | null;
  tags: string[] | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountId: string | null;
  accountName: string | null;
  spentAt: string;
  isRecurring: boolean;
  frequency: string;
}

export interface DecryptedBudgetRow {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  period: string;
  amount: number;
  currency: string;
}

export interface DecryptedGoalRow {
  id: string;
  name: string;
  icon: string | null;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  deadline: string | null;
  priority: string;
  monthlyContribution: number | null;
  status: string;
}

/** Just the fields `computeBudgetsData`/`computeAnalyticsData` need from
 * active goals — a narrower shape than the full `DecryptedGoalRow` used by
 * the Goals page itself, mirroring `raw-data.ts`'s `activeGoals`. */
export interface DecryptedActiveGoal {
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number | null;
  deadline: string | null;
}

export interface DecryptedLoanRow {
  id: string;
  name: string;
  type: LoanType;
  principal: number;
  interestRate: number;
  emi: number;
  remainingAmount: number;
  remainingMonths: number | null;
  extraEmi: number | null;
  currency: string;
  startDate: string;
}

/** Just the fields `computeBudgetsData`/`computeAnalyticsData` need from
 * loans — a narrower shape than the full `DecryptedLoanRow` used by the
 * Loans page itself, mirroring `RawActiveGoalRow`/`DecryptedActiveGoal`. */
export interface DecryptedLoanAmounts {
  emi: number;
  extraEmi: number;
  remainingAmount: number;
}

export interface DecryptResult<T> {
  rows: T[];
  failedCount: number;
}

export async function decryptIncomeRows(
  rows: RawIncomeRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedIncomeRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedIncomeRow> => ({
      ...r,
      amount: Number(await decryptPacked(r.amount, dek)),
      description: r.description ? await decryptPacked(r.description, dek) : null,
    })),
  );
  return splitSettled(settled);
}

export async function decryptExpenseRows(
  rows: RawExpenseRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedExpenseRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedExpenseRow> => {
      const tagsJson = r.tags ? await decryptPacked(r.tags, dek) : null;
      return {
        ...r,
        amount: Number(await decryptPacked(r.amount, dek)),
        description: r.description ? await decryptPacked(r.description, dek) : null,
        note: r.note ? await decryptPacked(r.note, dek) : null,
        tags: tagsJson ? (JSON.parse(tagsJson) as string[]) : null,
      };
    }),
  );
  return splitSettled(settled);
}

export async function decryptBudgetRows(
  rows: RawBudgetRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedBudgetRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedBudgetRow> => ({
      ...r,
      amount: Number(await decryptPacked(r.amount, dek)),
    })),
  );
  return splitSettled(settled);
}

export async function decryptGoalRows(
  rows: RawGoalRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedGoalRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedGoalRow> => ({
      ...r,
      targetAmount: Number(await decryptPacked(r.targetAmount, dek)),
      currentAmount: Number(await decryptPacked(r.currentAmount, dek)),
      monthlyContribution: r.monthlyContribution
        ? Number(await decryptPacked(r.monthlyContribution, dek))
        : null,
    })),
  );
  return splitSettled(settled);
}

export async function decryptActiveGoals(
  rows: RawActiveGoalRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedActiveGoal>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedActiveGoal> => ({
      targetAmount: Number(await decryptPacked(r.targetAmount, dek)),
      currentAmount: Number(await decryptPacked(r.currentAmount, dek)),
      monthlyContribution: r.monthlyContribution
        ? Number(await decryptPacked(r.monthlyContribution, dek))
        : null,
      deadline: r.deadline,
    })),
  );
  return splitSettled(settled);
}

export async function decryptLoanRows(
  rows: RawLoanRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedLoanRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedLoanRow> => ({
      ...r,
      principal: Number(await decryptPacked(r.principal, dek)),
      emi: Number(await decryptPacked(r.emi, dek)),
      remainingAmount: Number(await decryptPacked(r.remainingAmount, dek)),
      extraEmi: r.extraEmi ? Number(await decryptPacked(r.extraEmi, dek)) : null,
    })),
  );
  return splitSettled(settled);
}

export async function decryptLoanAmounts(
  rows: RawLoanAmountRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedLoanAmounts>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedLoanAmounts> => ({
      emi: Number(await decryptPacked(r.emi, dek)),
      extraEmi: r.extraEmi ? Number(await decryptPacked(r.extraEmi, dek)) : 0,
      remainingAmount: Number(await decryptPacked(r.remainingAmount, dek)),
    })),
  );
  return splitSettled(settled);
}

function splitSettled<T>(settled: PromiseSettledResult<T>[]): DecryptResult<T> {
  const rows: T[] = [];
  let failedCount = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") rows.push(s.value);
    else failedCount++;
  }
  return { rows, failedCount };
}
