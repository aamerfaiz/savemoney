"use client";

/**
 * Investments/recurring/net-worth-snapshots aren't encrypted yet, but
 * Dashboard, Net Worth, Reports, and Notifications all compose them together
 * with the now-client-side budgets/analytics, so they have to be fetchable
 * from the same client context. goals and loans are the exceptions as of
 * Phase 3.5.4: `fetchGoalsDataAction()`/`fetchLoansDataAction()` now return
 * packed ciphertext, decrypted here and run through `computeGoalsData()`/
 * `computeLoansData()` — mirroring how useFinanceData handles
 * income/expenses/budgets. Cached by TanStack Query like useFinanceData.
 */

import { useQuery } from "@tanstack/react-query";

import {
  fetchGoalsDataAction,
  fetchInvestmentsDataAction,
  fetchLoansDataAction,
  fetchNetWorthSnapshotsAction,
  fetchRecurringDataAction,
} from "./side-data";
import { decryptGoalRows, decryptLoanRows } from "./decrypt";
import { computeGoalsData } from "@/lib/goals/compute";
import { computeLoansData } from "@/lib/loans/compute";
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

      const [rawGoals, rawLoans, investmentsData, recurringData, snapshots] =
        await Promise.all([
          fetchGoalsDataAction(),
          fetchLoansDataAction(),
          fetchInvestmentsDataAction(),
          fetchRecurringDataAction(),
          fetchNetWorthSnapshotsAction(),
        ]);

      const [goalRowsResult, loanRowsResult] = await Promise.all([
        decryptGoalRows(rawGoals, dek),
        decryptLoanRows(rawLoans, dek),
      ]);
      const goalsData = computeGoalsData(goalRowsResult.rows, currency);
      const loansData = computeLoansData(loanRowsResult.rows, currency);

      return {
        goalsData,
        loansData,
        investmentsData,
        recurringData,
        snapshots,
        failedGoalCount: goalRowsResult.failedCount,
        failedLoanCount: loanRowsResult.failedCount,
      };
    },
  });
}
