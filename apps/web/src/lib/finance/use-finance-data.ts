"use client";

/**
 * The shared client-side finance data layer (Phase 3.5.3). Fetches the raw
 * (ciphertext) rows once, decrypts with the unlocked vault's DEK, and runs
 * every domain's compute function over the same decrypted rows — so
 * Dashboard, Budget, Analytics, Net Worth, Reports, Financial Score, and
 * Transactions all derive from one fetch instead of each re-fetching and
 * re-decrypting independently. Cached/deduped across pages by TanStack
 * Query (already provisioned app-wide, see src/components/providers.tsx).
 */

import { useQuery } from "@tanstack/react-query";

import type { CurrencyCode } from "@savemoney/finance-engine/format";
import { fetchFinanceRawData } from "./raw-data";
import {
  decryptActiveGoals,
  decryptBudgetRows,
  decryptContributionRows,
  decryptExpenseRows,
  decryptIncomeRows,
  decryptInvestmentContributionRows,
  decryptInvestmentMonthlyContributions,
  decryptLoanAmounts,
} from "./decrypt";
import {
  backfillBudgetRows,
  backfillExpenseRows,
  backfillGoalContributionRows,
  backfillIncomeRows,
  backfillInvestmentContributionRows,
} from "@/lib/vault/backfill-actions";
import { useDecryptProgressStore, withProgress } from "./decrypt-progress";
import { computeBudgetsData, type BudgetsData } from "@/lib/budgets/compute";
import { computeAnalyticsData } from "@/lib/analytics/compute";
import { computeTransactionsList } from "@/lib/transactions/compute";
import type { AnalyticsData } from "@/lib/analytics/types";
import type { Transaction } from "@/lib/transactions/types";
import { useVaultStore } from "@/lib/vault/store";

export interface FinanceData {
  budgets: BudgetsData;
  analytics: AnalyticsData;
  transactions: Transaction[];
  /** Rows that existed but couldn't be decrypted with the current DEK —
   * either encrypted under a different vault, or (right now) pre-3.5.3/
   * pre-3.5.4 rows that were never encrypted at all. Surfaced so the UI
   * can say so instead of silently under-counting. */
  failedIncomeCount: number;
  failedExpenseCount: number;
  failedBudgetCount: number;
  failedContributionCount: number;
}

export function useFinanceData(currency: CurrencyCode) {
  const dek = useVaultStore((s) => s.dek);

  return useQuery<FinanceData>({
    queryKey: ["finance-data"],
    enabled: !!dek,
    // Retrying a failed auth/vault fetch wastes time without changing the
    // outcome — surface the real error immediately instead.
    retry: false,
    queryFn: async () => {
      if (!dek) throw new Error("Vault is locked.");

      const raw = await fetchFinanceRawData();
      if ("error" in raw) throw new Error(raw.error);

      // Row-weighted decrypt progress (Phase 3.5.10) — total is known the
      // instant ciphertext arrives; each dataset ticks its own row count
      // in as it finishes, so a 300-row expenses list moves the bar
      // proportionally more than a 3-row budgets list.
      useDecryptProgressStore.getState().startChunk(
        "finance-data",
        raw.income.length +
          raw.expenses.length +
          raw.budgets.length +
          raw.activeGoals.length +
          raw.loans.length +
          raw.investmentMonthlyContributions.length +
          raw.contributions.length +
          raw.investmentContributions.length,
      );

      const [
        incomeResult,
        expenseResult,
        budgetResult,
        activeGoalsResult,
        loanAmountsResult,
        investmentMonthlyContributionsResult,
        contributionsResult,
        investmentContributionsResult,
      ] = await Promise.all([
        withProgress("finance-data", raw.income.length, decryptIncomeRows(raw.income, dek)),
        withProgress("finance-data", raw.expenses.length, decryptExpenseRows(raw.expenses, dek)),
        withProgress("finance-data", raw.budgets.length, decryptBudgetRows(raw.budgets, dek)),
        withProgress(
          "finance-data",
          raw.activeGoals.length,
          decryptActiveGoals(raw.activeGoals, dek),
        ),
        withProgress("finance-data", raw.loans.length, decryptLoanAmounts(raw.loans, dek)),
        withProgress(
          "finance-data",
          raw.investmentMonthlyContributions.length,
          decryptInvestmentMonthlyContributions(raw.investmentMonthlyContributions, dek),
        ),
        withProgress(
          "finance-data",
          raw.contributions.length,
          decryptContributionRows(raw.contributions, dek),
        ),
        withProgress(
          "finance-data",
          raw.investmentContributions.length,
          decryptInvestmentContributionRows(raw.investmentContributions, dek),
        ),
      ]);

      // Phase 3.5.7 "Backfill" — fire-and-forget re-encryption of any
      // legacy plaintext rows this decrypt pass recovered. Never awaited
      // (a failed write just means this row falls back to needing
      // recovery again next load, not a lost row) and never blocks
      // rendering the data already in hand.
      if (incomeResult.backfill.length) backfillIncomeRows(incomeResult.backfill).catch(() => {});
      if (expenseResult.backfill.length) backfillExpenseRows(expenseResult.backfill).catch(() => {});
      if (budgetResult.backfill.length) backfillBudgetRows(budgetResult.backfill).catch(() => {});
      if (contributionsResult.backfill.length) {
        backfillGoalContributionRows(contributionsResult.backfill).catch(() => {});
      }
      if (investmentContributionsResult.backfill.length) {
        backfillInvestmentContributionRows(investmentContributionsResult.backfill).catch(() => {});
      }

      const budgets = computeBudgetsData(
        expenseResult.rows,
        incomeResult.rows,
        budgetResult.rows,
        activeGoalsResult.rows,
        loanAmountsResult.rows,
        investmentMonthlyContributionsResult.rows,
        currency,
      );
      const analytics = computeAnalyticsData(
        incomeResult.rows,
        expenseResult.rows,
        activeGoalsResult.rows,
        loanAmountsResult.rows,
        contributionsResult.rows,
        investmentContributionsResult.rows,
        currency,
      );
      const transactions = computeTransactionsList(
        incomeResult.rows,
        expenseResult.rows,
        contributionsResult.rows,
      );

      return {
        budgets,
        analytics,
        transactions,
        failedIncomeCount: incomeResult.failedCount,
        failedExpenseCount: expenseResult.failedCount,
        failedBudgetCount: budgetResult.failedCount,
        failedContributionCount: contributionsResult.failedCount,
      };
    },
  });
}
