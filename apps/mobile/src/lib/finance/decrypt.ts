/**
 * Client-side decryption of raw finance rows — Phase 5.5b, mobile's
 * counterpart to apps/web/src/lib/finance/decrypt.ts. Deliberately
 * narrower: only income/expenses/contributions (what Transactions
 * needs), and **no backfill recovery** for pre-migration plaintext rows
 * (`decryptOrRecoverPacked`/`UndecryptableError` on web). Backfill exists
 * for rows written before Phase 3.5.3 shipped, years before this mobile
 * port started — a genuinely undecryptable row here is a real failure,
 * not a legacy-plaintext row, so a straight `decryptPacked` throw is the
 * right behavior, not a gap. Extend this file the same way web's grew
 * (one `decrypt<X>Rows` function per module) as Phase 5.5c ports more
 * modules — don't invent a second pattern.
 */

import { decryptPacked } from "../vault/crypto";
import type {
  RawActiveGoalRow,
  RawBudgetRow,
  RawContributionRow,
  RawExpenseRow,
  RawIncomeRow,
  RawLoanAmountRow,
} from "@savemoney/api-client";

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

export interface DecryptedContributionRow {
  id: string;
  amount: number;
  contributedAt: string;
  note: string | null;
  goalName: string | null;
  goalIcon: string | null;
  goalDeletedAt: string | null;
}

export interface DecryptResult<T> {
  rows: T[];
  failedCount: number;
}

async function decryptNullable(value: string | null, dek: CryptoKey): Promise<string | null> {
  if (value === null) return null;
  return decryptPacked(value, dek);
}

function splitSettled<T>(settled: PromiseSettledResult<T>[]): DecryptResult<T> {
  const rows: T[] = [];
  let failedCount = 0;
  for (const r of settled) {
    if (r.status === "fulfilled") rows.push(r.value);
    else failedCount++;
  }
  return { rows, failedCount };
}

export async function decryptIncomeRows(
  rows: RawIncomeRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedIncomeRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedIncomeRow> => ({
      ...r,
      amount: Number(await decryptPacked(r.amount, dek)),
      description: await decryptNullable(r.description, dek),
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
      const tags = await decryptNullable(r.tags, dek);
      return {
        ...r,
        amount: Number(await decryptPacked(r.amount, dek)),
        description: await decryptNullable(r.description, dek),
        note: await decryptNullable(r.note, dek),
        tags: tags ? (JSON.parse(tags) as string[]) : null,
      };
    }),
  );
  return splitSettled(settled);
}

export async function decryptContributionRows(
  rows: RawContributionRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedContributionRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedContributionRow> => ({
      ...r,
      amount: Number(await decryptPacked(r.amount, dek)),
    })),
  );
  return splitSettled(settled);
}

/* ----------------------------------------------------------------------- */
/* Budget-feeding narrow shapes — Phase 5.5c. Mirrors DecryptedActiveGoal/  */
/* DecryptedLoanAmounts on web: just the fields computeBudgetsData() needs, */
/* not each module's full row (that's each module's own decrypt function,  */
/* added alongside its own screen). No row `id` in these narrow raw shapes, */
/* so — same as web — there's no backfill path for them either way.        */
/* ----------------------------------------------------------------------- */

export interface DecryptedBudgetRow {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  period: string;
  amount: number;
  currency: string;
}

export interface DecryptedActiveGoal {
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number | null;
  deadline: string | null;
}

export interface DecryptedLoanAmounts {
  emi: number;
  extraEmi: number;
  remainingAmount: number;
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

export async function decryptInvestmentMonthlyContributions(
  rows: (string | null)[],
  dek: CryptoKey,
): Promise<DecryptResult<number>> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => (r ? Number(await decryptPacked(r, dek)) : 0)),
  );
  return splitSettled(settled);
}

/* ----------------------------------------------------------------------- */
/* Goals — Phase 5.5c, full row (the Goals page's own list, not the        */
/* narrow DecryptedActiveGoal above).                                      */
/* ----------------------------------------------------------------------- */

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

export async function decryptGoalRows(
  rows: import("@savemoney/api-client").RawGoalRow[],
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

/* ----------------------------------------------------------------------- */
/* Loans — Phase 5.5c, full row.                                           */
/* ----------------------------------------------------------------------- */

export interface DecryptedLoanRow {
  id: string;
  name: string;
  type: import("@savemoney/api-client").LoanType;
  principal: number;
  interestRate: number;
  emi: number;
  remainingAmount: number;
  remainingMonths: number | null;
  extraEmi: number | null;
  currency: string;
  startDate: string;
}

export async function decryptLoanRows(
  rows: import("@savemoney/api-client").RawLoanRow[],
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

/* ----------------------------------------------------------------------- */
/* Investments — Phase 5.5c, full row.                                     */
/* ----------------------------------------------------------------------- */

export interface DecryptedInvestmentRow {
  id: string;
  name: string;
  type: import("@savemoney/api-client").InvestmentType;
  investedAmount: number;
  currentValue: number;
  monthlyContribution: number | null;
  expectedReturn: number;
  currency: string;
  startDate: string;
}

export async function decryptInvestmentRows(
  rows: import("@savemoney/api-client").RawInvestmentRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedInvestmentRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedInvestmentRow> => ({
      ...r,
      investedAmount: Number(await decryptPacked(r.investedAmount, dek)),
      currentValue: Number(await decryptPacked(r.currentValue, dek)),
      monthlyContribution: r.monthlyContribution
        ? Number(await decryptPacked(r.monthlyContribution, dek))
        : null,
    })),
  );
  return splitSettled(settled);
}

/** Narrow shape Analytics needs from investment contributions — same raw
 * rows finance.raw() already returns (`investmentContributions`), no new
 * route needed. */
export interface DecryptedInvestmentContribution {
  id: string;
  amount: number;
  contributedAt: string;
}

export async function decryptInvestmentContributionRows(
  rows: { id: string; amount: string; contributedAt: string }[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedInvestmentContribution>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedInvestmentContribution> => ({
      ...r,
      amount: Number(await decryptPacked(r.amount, dek)),
    })),
  );
  return splitSettled(settled);
}

/* ----------------------------------------------------------------------- */
/* Net Worth — Phase 5.5c, snapshot rows.                                  */
/* ----------------------------------------------------------------------- */

export interface DecryptedSnapshotRow {
  id: string;
  capturedAt: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  note: string | null;
}

export async function decryptSnapshotRows(
  rows: import("@savemoney/api-client").RawSnapshotRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedSnapshotRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedSnapshotRow> => ({
      ...r,
      totalAssets: Number(await decryptPacked(r.totalAssets, dek)),
      totalLiabilities: Number(await decryptPacked(r.totalLiabilities, dek)),
      netWorth: Number(await decryptPacked(r.netWorth, dek)),
    })),
  );
  return splitSettled(settled);
}
