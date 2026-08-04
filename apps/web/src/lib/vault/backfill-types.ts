/**
 * Row shapes for Phase 3.5.7 "Backfill" — no `"use client"`/`"server-only"`
 * pragma, deliberately, since these types cross both sides: `finance/
 * decrypt.ts` (client) builds them while decrypting, `vault/
 * backfill-actions.ts` (server) accepts them to write back. Every field
 * is an already-packed ciphertext string (or `null`), same as the raw
 * columns themselves — a row only appears here at all once at least one
 * of its fields turned out to be legacy plaintext.
 */

export interface IncomeBackfillRow {
  id: string;
  amount: string;
  description: string | null;
}

export interface ExpenseBackfillRow {
  id: string;
  amount: string;
  description: string | null;
  note: string | null;
  tags: string | null;
}

export interface BudgetBackfillRow {
  id: string;
  amount: string;
}

export interface GoalBackfillRow {
  id: string;
  targetAmount: string;
  currentAmount: string;
  monthlyContribution: string | null;
}

export interface GoalContributionBackfillRow {
  id: string;
  amount: string;
}

export interface LoanBackfillRow {
  id: string;
  principal: string;
  emi: string;
  remainingAmount: string;
  extraEmi: string | null;
}

export interface InvestmentBackfillRow {
  id: string;
  investedAmount: string;
  currentValue: string;
  monthlyContribution: string | null;
}

export interface InvestmentContributionBackfillRow {
  id: string;
  amount: string;
}

export interface SnapshotBackfillRow {
  id: string;
  totalAssets: string;
  totalLiabilities: string;
  netWorth: string;
}

export interface RecurringRuleBackfillRow {
  id: string;
  amount: string;
}
