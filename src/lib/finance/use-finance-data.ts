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

import type { CurrencyCode } from "@/lib/format";
import { fetchFinanceRawData } from "./raw-data";
import {
  decryptActiveGoals,
  decryptBudgetRows,
  decryptExpenseRows,
  decryptIncomeRows,
  decryptLoanAmounts,
} from "./decrypt";
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

      const [incomeResult, expenseResult, budgetResult, activeGoalsResult, loanAmountsResult] =
        await Promise.all([
          decryptIncomeRows(raw.income, dek),
          decryptExpenseRows(raw.expenses, dek),
          decryptBudgetRows(raw.budgets, dek),
          decryptActiveGoals(raw.activeGoals, dek),
          decryptLoanAmounts(raw.loans, dek),
        ]);

      const budgets = computeBudgetsData(
        expenseResult.rows,
        incomeResult.rows,
        budgetResult.rows,
        activeGoalsResult.rows,
        loanAmountsResult.rows,
        raw,
        currency,
      );
      const analytics = computeAnalyticsData(
        incomeResult.rows,
        expenseResult.rows,
        activeGoalsResult.rows,
        loanAmountsResult.rows,
        raw,
        currency,
      );
      const transactions = computeTransactionsList(
        incomeResult.rows,
        expenseResult.rows,
        raw.contributions,
      );

      return {
        budgets,
        analytics,
        transactions,
        failedIncomeCount: incomeResult.failedCount,
        failedExpenseCount: expenseResult.failedCount,
        failedBudgetCount: budgetResult.failedCount,
      };
    },
  });
}
