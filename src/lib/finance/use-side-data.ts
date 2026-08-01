"use client";

/**
 * Recurring isn't encrypted yet, but Dashboard, Net Worth, Reports, and
 * Notifications all compose it together with the now-client-side
 * budgets/analytics, so it has to be fetchable from the same client
 * context. goals, loans, investments, and net-worth-snapshots are the
 * exceptions as of Phase 3.5.4: `fetchGoalsDataAction()`/
 * `fetchLoansDataAction()`/`fetchInvestmentsDataAction()`/
 * `fetchNetWorthSnapshotsAction()` now return packed ciphertext, decrypted
 * here and (for goals/loans/investments) run through `computeGoalsData()`/
 * `computeLoansData()`/`computeInvestmentsData()` — mirroring how
 * useFinanceData handles income/expenses/budgets. Cached by TanStack Query
 * like useFinanceData.
 */

import { useQuery } from "@tanstack/react-query";

import {
  fetchGoalsDataAction,
  fetchInvestmentsDataAction,
  fetchLoansDataAction,
  fetchNetWorthSnapshotsAction,
  fetchRecurringDataAction,
} from "./side-data";
import {
  decryptGoalRows,
  decryptInvestmentRows,
  decryptLoanRows,
  decryptSnapshotRows,
} from "./decrypt";
import { computeGoalsData } from "@/lib/goals/compute";
import { computeLoansData } from "@/lib/loans/compute";
import { computeInvestmentsData } from "@/lib/investments/compute";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@/lib/format";

export function useSideData(currency: CurrencyCode) {
  const dek = useVaultStore((s) => s.dek);

  return useQuery({
    queryKey: ["finance-side-data"],
    enabled: !!dek,
    retry: false,
    queryFn: async () => {
      if (!dek) throw new Error("Vault is locked.");

      const [rawGoals, rawLoans, rawInvestments, recurringData, rawSnapshots] =
        await Promise.all([
          fetchGoalsDataAction(),
          fetchLoansDataAction(),
          fetchInvestmentsDataAction(),
          fetchRecurringDataAction(),
          fetchNetWorthSnapshotsAction(),
        ]);

      const [goalRowsResult, loanRowsResult, investmentRowsResult, snapshotRowsResult] =
        await Promise.all([
          decryptGoalRows(rawGoals, dek),
          decryptLoanRows(rawLoans, dek),
          decryptInvestmentRows(rawInvestments, dek),
          decryptSnapshotRows(rawSnapshots, dek),
        ]);
      const goalsData = computeGoalsData(goalRowsResult.rows, currency);
      const loansData = computeLoansData(loanRowsResult.rows, currency);
      const investmentsData = computeInvestmentsData(investmentRowsResult.rows, currency);

      return {
        goalsData,
        loansData,
        investmentsData,
        recurringData,
        snapshots: snapshotRowsResult.rows,
        failedGoalCount: goalRowsResult.failedCount,
        failedLoanCount: loanRowsResult.failedCount,
        failedInvestmentCount: investmentRowsResult.failedCount,
        failedSnapshotCount: snapshotRowsResult.failedCount,
      };
    },
  });
}
