"use client";

/**
 * Client-side decryption of raw finance rows (Phase 3.5.3). Fault-tolerant
 * per row on purpose: rows encrypted under a different DEK fail to decrypt
 * individually rather than taking down the whole list. Callers get back
 * what could be read plus a count of what couldn't, so the UI can say so
 * instead of going blank.
 *
 * Phase 3.5.7 "Backfill" extends this: a row that fails to decrypt is no
 * longer automatically counted as unreadable. `decryptOrRecoverPacked`
 * (vault/crypto.ts) first checks whether the stored value even looks like
 * a packed payload — if it doesn't, it's confidently a pre-migration
 * plaintext row (never encrypted at all), which this file recovers
 * transparently (no user-visible failure) and hands back, alongside a
 * freshly re-encrypted version, in a `backfill` array on the result.
 * Callers that own a table's primary page (see use-finance-data.ts /
 * use-side-data.ts) fire the matching `backfillXRows` action with that
 * array — "the first time they touch the now-migrated module" per the
 * plan doc. A row that *does* look like real ciphertext but still fails
 * to decrypt (wrong DEK, corruption) still counts as a genuine failure —
 * backfill never guesses at those.
 */

import { decryptOrRecoverPacked, decryptPacked } from "@/lib/vault/crypto";
import type {
  RawIncomeRow,
  RawExpenseRow,
  RawBudgetRow,
  RawActiveGoalRow,
  RawLoanAmountRow,
  RawContributionRow,
} from "./raw-data";
import type { RawGoalRow } from "@/lib/goals/queries";
import type {
  RawCollectionRow,
  RawCollectionParticipantRow,
  RawCollectionContributionRow,
  RawCollectionExpenseRow,
} from "@/lib/collections/queries";
import type { RawLoanRow } from "@/lib/loans/queries";
import type { LoanType } from "@/lib/loans/types";
import type { RawInvestmentRow } from "@/lib/investments/queries";
import type { InvestmentType } from "@/lib/investments/types";
import type { RawSnapshotRow } from "@/lib/networth/queries";
import type { RawRecurringRow } from "@/lib/recurring/queries";
import type { RecurringKind } from "@/lib/recurring/types";
import type {
  IncomeBackfillRow,
  ExpenseBackfillRow,
  BudgetBackfillRow,
  GoalBackfillRow,
  GoalContributionBackfillRow,
  LoanBackfillRow,
  InvestmentBackfillRow,
  InvestmentContributionBackfillRow,
  SnapshotBackfillRow,
  RecurringRuleBackfillRow,
} from "@/lib/vault/backfill-types";

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
 * the Goals page itself, mirroring `raw-data.ts`'s `activeGoals`. No row
 * `id` in the raw fetch, so this path can't participate in backfill —
 * legacy plaintext active goals get recovered when the user visits the
 * Goals page itself (`decryptGoalRows`, below). */
export interface DecryptedActiveGoal {
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number | null;
  deadline: string | null;
}

export interface DecryptedCollectionRow {
  id: string;
  title: string;
  purpose: string | null;
  icon: string | null;
  targetAmount: number | null;
  currency: string;
  eventDate: string | null;
  status: string;
}

export interface DecryptedCollectionParticipantRow {
  id: string;
  collectionId: string;
  displayName: string;
  linkedUserId: string | null;
}

export interface DecryptedCollectionContributionRow {
  id: string;
  collectionId: string;
  participantId: string | null;
  /** Legacy fallback name — only set (and only meaningful) when
   * `participantId` is null; see the schema comment on
   * `collection_contributions.contributor_name`. */
  contributorName: string | null;
  amount: number;
  contributedAt: string;
  method: string | null;
  note: string | null;
}

export interface DecryptedCollectionExpenseRow {
  id: string;
  collectionId: string;
  amount: number;
  description: string | null;
  categoryId: string | null;
  paidByParticipantId: string | null;
  spentAt: string;
  linkedTransactionId: string | null;
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
 * Loans page itself, mirroring `RawActiveGoalRow`/`DecryptedActiveGoal`.
 * No row `id` (and no `principal`) in the raw fetch, so no backfill here
 * either — see `decryptLoanRows`. */
export interface DecryptedLoanAmounts {
  emi: number;
  extraEmi: number;
  remainingAmount: number;
}

export interface DecryptedInvestmentRow {
  id: string;
  name: string;
  type: InvestmentType;
  investedAmount: number;
  currentValue: number;
  monthlyContribution: number | null;
  expectedReturn: number;
  currency: string;
  startDate: string;
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

export interface DecryptedInvestmentContribution {
  id: string;
  amount: number;
  contributedAt: string;
}

export interface DecryptedRecurringRow {
  id: string;
  name: string;
  kind: RecurringKind;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  accountId: string | null;
  amount: number;
  frequency: string;
  interval: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  note: string | null;
}

export interface DecryptedSnapshotRow {
  id: string;
  capturedAt: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  note: string | null;
}

export interface DecryptResult<T> {
  rows: T[];
  failedCount: number;
}

/** Signals "this value never needed decrypting at all" up to the caller,
 * without treating the row as failed. Thrown only inside the per-row
 * builders below and caught by `Promise.allSettled` the same as a real
 * decrypt failure would be — the difference is entirely in which of the
 * two counts as `failedCount` vs. a recovered, backfillable row. */
class UndecryptableError extends Error {}

async function recoverOrThrow(value: string, dek: CryptoKey) {
  const recovered = await decryptOrRecoverPacked(value, dek);
  if (!recovered) throw new UndecryptableError();
  return recovered;
}

async function recoverNullableOrThrow(value: string | null, dek: CryptoKey) {
  if (value === null) return null;
  return recoverOrThrow(value, dek);
}

export async function decryptIncomeRows(
  rows: RawIncomeRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedIncomeRow> & { backfill: IncomeBackfillRow[] }> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => {
      const amount = await recoverOrThrow(r.amount, dek);
      const description = await recoverNullableOrThrow(r.description, dek);
      const row: DecryptedIncomeRow = {
        ...r,
        amount: Number(amount.plaintext),
        description: description ? description.plaintext : null,
      };
      const backfill: IncomeBackfillRow | null =
        amount.backfillPacked !== null || (description && description.backfillPacked !== null)
          ? {
              id: r.id,
              amount: amount.backfillPacked ?? r.amount,
              description: r.description !== null ? (description!.backfillPacked ?? r.description) : null,
            }
          : null;
      return { row, backfill };
    }),
  );
  return splitSettledWithBackfill(settled);
}

export async function decryptExpenseRows(
  rows: RawExpenseRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedExpenseRow> & { backfill: ExpenseBackfillRow[] }> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => {
      const amount = await recoverOrThrow(r.amount, dek);
      const description = await recoverNullableOrThrow(r.description, dek);
      const note = await recoverNullableOrThrow(r.note, dek);
      const tags = await recoverNullableOrThrow(r.tags, dek);
      const row: DecryptedExpenseRow = {
        ...r,
        amount: Number(amount.plaintext),
        description: description ? description.plaintext : null,
        note: note ? note.plaintext : null,
        tags: tags ? (JSON.parse(tags.plaintext) as string[]) : null,
      };
      const needsBackfill =
        amount.backfillPacked !== null ||
        (description && description.backfillPacked !== null) ||
        (note && note.backfillPacked !== null) ||
        (tags && tags.backfillPacked !== null);
      const backfill: ExpenseBackfillRow | null = needsBackfill
        ? {
            id: r.id,
            amount: amount.backfillPacked ?? r.amount,
            description: r.description !== null ? (description!.backfillPacked ?? r.description) : null,
            note: r.note !== null ? (note!.backfillPacked ?? r.note) : null,
            tags: r.tags !== null ? (tags!.backfillPacked ?? r.tags) : null,
          }
        : null;
      return { row, backfill };
    }),
  );
  return splitSettledWithBackfill(settled);
}

export async function decryptBudgetRows(
  rows: RawBudgetRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedBudgetRow> & { backfill: BudgetBackfillRow[] }> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => {
      const amount = await recoverOrThrow(r.amount, dek);
      const row: DecryptedBudgetRow = { ...r, amount: Number(amount.plaintext) };
      const backfill: BudgetBackfillRow | null =
        amount.backfillPacked !== null ? { id: r.id, amount: amount.backfillPacked } : null;
      return { row, backfill };
    }),
  );
  return splitSettledWithBackfill(settled);
}

export async function decryptGoalRows(
  rows: RawGoalRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedGoalRow> & { backfill: GoalBackfillRow[] }> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => {
      const targetAmount = await recoverOrThrow(r.targetAmount, dek);
      const currentAmount = await recoverOrThrow(r.currentAmount, dek);
      const monthlyContribution = await recoverNullableOrThrow(r.monthlyContribution, dek);
      const row: DecryptedGoalRow = {
        ...r,
        targetAmount: Number(targetAmount.plaintext),
        currentAmount: Number(currentAmount.plaintext),
        monthlyContribution: monthlyContribution ? Number(monthlyContribution.plaintext) : null,
      };
      const needsBackfill =
        targetAmount.backfillPacked !== null ||
        currentAmount.backfillPacked !== null ||
        (monthlyContribution && monthlyContribution.backfillPacked !== null);
      const backfill: GoalBackfillRow | null = needsBackfill
        ? {
            id: r.id,
            targetAmount: targetAmount.backfillPacked ?? r.targetAmount,
            currentAmount: currentAmount.backfillPacked ?? r.currentAmount,
            monthlyContribution:
              r.monthlyContribution !== null
                ? (monthlyContribution!.backfillPacked ?? r.monthlyContribution)
                : null,
          }
        : null;
      return { row, backfill };
    }),
  );
  return splitSettledWithBackfill(settled);
}

/** No backfill path here (unlike goals/loans/etc.) — `collections` never
 * existed before client-side encryption, so there's no legacy plaintext row
 * to recover. A row that fails to decrypt is always a genuine failure
 * (wrong DEK, corruption), never "pre-migration plaintext". */
export async function decryptCollectionRows(
  rows: RawCollectionRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedCollectionRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedCollectionRow> => ({
      id: r.id,
      title: r.title,
      purpose: r.purpose,
      icon: r.icon,
      targetAmount: r.targetAmount ? Number(await decryptPacked(r.targetAmount, dek)) : null,
      currency: r.currency,
      eventDate: r.eventDate,
      status: r.status,
    })),
  );
  return splitSettled(settled);
}

export async function decryptCollectionParticipantRows(
  rows: RawCollectionParticipantRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedCollectionParticipantRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedCollectionParticipantRow> => ({
      id: r.id,
      collectionId: r.collectionId,
      displayName: await decryptPacked(r.displayName, dek),
      linkedUserId: r.linkedUserId,
    })),
  );
  return splitSettled(settled);
}

export async function decryptCollectionContributionRows(
  rows: RawCollectionContributionRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedCollectionContributionRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedCollectionContributionRow> => ({
      id: r.id,
      collectionId: r.collectionId,
      participantId: r.participantId,
      contributorName: r.contributorName ? await decryptPacked(r.contributorName, dek) : null,
      amount: Number(await decryptPacked(r.amount, dek)),
      contributedAt: r.contributedAt,
      method: r.method,
      note: r.note ? await decryptPacked(r.note, dek) : null,
    })),
  );
  return splitSettled(settled);
}

export async function decryptCollectionExpenseRows(
  rows: RawCollectionExpenseRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedCollectionExpenseRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedCollectionExpenseRow> => ({
      id: r.id,
      collectionId: r.collectionId,
      amount: Number(await decryptPacked(r.amount, dek)),
      description: r.description ? await decryptPacked(r.description, dek) : null,
      categoryId: r.categoryId,
      paidByParticipantId: r.paidByParticipantId,
      spentAt: r.spentAt,
      linkedTransactionId: r.linkedTransactionId,
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
): Promise<DecryptResult<DecryptedLoanRow> & { backfill: LoanBackfillRow[] }> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => {
      const principal = await recoverOrThrow(r.principal, dek);
      const emi = await recoverOrThrow(r.emi, dek);
      const remainingAmount = await recoverOrThrow(r.remainingAmount, dek);
      const extraEmi = await recoverNullableOrThrow(r.extraEmi, dek);
      const row: DecryptedLoanRow = {
        ...r,
        principal: Number(principal.plaintext),
        emi: Number(emi.plaintext),
        remainingAmount: Number(remainingAmount.plaintext),
        extraEmi: extraEmi ? Number(extraEmi.plaintext) : null,
      };
      const needsBackfill =
        principal.backfillPacked !== null ||
        emi.backfillPacked !== null ||
        remainingAmount.backfillPacked !== null ||
        (extraEmi && extraEmi.backfillPacked !== null);
      const backfill: LoanBackfillRow | null = needsBackfill
        ? {
            id: r.id,
            principal: principal.backfillPacked ?? r.principal,
            emi: emi.backfillPacked ?? r.emi,
            remainingAmount: remainingAmount.backfillPacked ?? r.remainingAmount,
            extraEmi: r.extraEmi !== null ? (extraEmi!.backfillPacked ?? r.extraEmi) : null,
          }
        : null;
      return { row, backfill };
    }),
  );
  return splitSettledWithBackfill(settled);
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

export async function decryptInvestmentRows(
  rows: RawInvestmentRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedInvestmentRow> & { backfill: InvestmentBackfillRow[] }> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => {
      const investedAmount = await recoverOrThrow(r.investedAmount, dek);
      const currentValue = await recoverOrThrow(r.currentValue, dek);
      const monthlyContribution = await recoverNullableOrThrow(r.monthlyContribution, dek);
      const row: DecryptedInvestmentRow = {
        ...r,
        investedAmount: Number(investedAmount.plaintext),
        currentValue: Number(currentValue.plaintext),
        monthlyContribution: monthlyContribution ? Number(monthlyContribution.plaintext) : null,
      };
      const needsBackfill =
        investedAmount.backfillPacked !== null ||
        currentValue.backfillPacked !== null ||
        (monthlyContribution && monthlyContribution.backfillPacked !== null);
      const backfill: InvestmentBackfillRow | null = needsBackfill
        ? {
            id: r.id,
            investedAmount: investedAmount.backfillPacked ?? r.investedAmount,
            currentValue: currentValue.backfillPacked ?? r.currentValue,
            monthlyContribution:
              r.monthlyContribution !== null
                ? (monthlyContribution!.backfillPacked ?? r.monthlyContribution)
                : null,
          }
        : null;
      return { row, backfill };
    }),
  );
  return splitSettledWithBackfill(settled);
}

/** Just the monthly SIP amount `computeBudgetsData` needs — a narrower
 * shape than the full `DecryptedInvestmentRow` used by the Investments
 * page itself, mirroring `DecryptedActiveGoal`/`DecryptedLoanAmounts`. No
 * row identity in the raw fetch, so no backfill here — see
 * `decryptInvestmentRows`. */
export async function decryptInvestmentMonthlyContributions(
  rows: (string | null)[],
  dek: CryptoKey,
): Promise<DecryptResult<number>> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => (r ? Number(await decryptPacked(r, dek)) : 0)),
  );
  return splitSettled(settled);
}

export async function decryptContributionRows(
  rows: RawContributionRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedContributionRow> & { backfill: GoalContributionBackfillRow[] }> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => {
      const amount = await recoverOrThrow(r.amount, dek);
      const row: DecryptedContributionRow = { ...r, amount: Number(amount.plaintext) };
      const backfill: GoalContributionBackfillRow | null =
        amount.backfillPacked !== null ? { id: r.id, amount: amount.backfillPacked } : null;
      return { row, backfill };
    }),
  );
  return splitSettledWithBackfill(settled);
}

export async function decryptInvestmentContributionRows(
  rows: { id: string; amount: string; contributedAt: string }[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedInvestmentContribution> & { backfill: InvestmentContributionBackfillRow[] }> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => {
      const amount = await recoverOrThrow(r.amount, dek);
      const row: DecryptedInvestmentContribution = {
        id: r.id,
        amount: Number(amount.plaintext),
        contributedAt: r.contributedAt,
      };
      const backfill: InvestmentContributionBackfillRow | null =
        amount.backfillPacked !== null ? { id: r.id, amount: amount.backfillPacked } : null;
      return { row, backfill };
    }),
  );
  return splitSettledWithBackfill(settled);
}

export async function decryptRecurringRows(
  rows: RawRecurringRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedRecurringRow> & { backfill: RecurringRuleBackfillRow[] }> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => {
      const amount = await recoverOrThrow(r.amount, dek);
      const row: DecryptedRecurringRow = { ...r, amount: Number(amount.plaintext) };
      const backfill: RecurringRuleBackfillRow | null =
        amount.backfillPacked !== null ? { id: r.id, amount: amount.backfillPacked } : null;
      return { row, backfill };
    }),
  );
  return splitSettledWithBackfill(settled);
}

export async function decryptSnapshotRows(
  rows: RawSnapshotRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedSnapshotRow> & { backfill: SnapshotBackfillRow[] }> {
  const settled = await Promise.allSettled(
    rows.map(async (r) => {
      const totalAssets = await recoverOrThrow(r.totalAssets, dek);
      const totalLiabilities = await recoverOrThrow(r.totalLiabilities, dek);
      const netWorth = await recoverOrThrow(r.netWorth, dek);
      const row: DecryptedSnapshotRow = {
        ...r,
        totalAssets: Number(totalAssets.plaintext),
        totalLiabilities: Number(totalLiabilities.plaintext),
        netWorth: Number(netWorth.plaintext),
      };
      const needsBackfill =
        totalAssets.backfillPacked !== null ||
        totalLiabilities.backfillPacked !== null ||
        netWorth.backfillPacked !== null;
      const backfill: SnapshotBackfillRow | null = needsBackfill
        ? {
            id: r.id,
            totalAssets: totalAssets.backfillPacked ?? r.totalAssets,
            totalLiabilities: totalLiabilities.backfillPacked ?? r.totalLiabilities,
            netWorth: netWorth.backfillPacked ?? r.netWorth,
          }
        : null;
      return { row, backfill };
    }),
  );
  return splitSettledWithBackfill(settled);
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

function splitSettledWithBackfill<T, B>(
  settled: PromiseSettledResult<{ row: T; backfill: B | null }>[],
): DecryptResult<T> & { backfill: B[] } {
  const rows: T[] = [];
  const backfill: B[] = [];
  let failedCount = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      rows.push(s.value.row);
      if (s.value.backfill) backfill.push(s.value.backfill);
    } else {
      failedCount++;
    }
  }
  return { rows, failedCount, backfill };
}
