"use client";

/**
 * goals, loans, investments, net-worth-snapshots, and recurring all landed
 * encryption across Phase 3.5.4: `fetchGoalsDataAction()`/
 * `fetchLoansDataAction()`/`fetchInvestmentsDataAction()`/
 * `fetchNetWorthSnapshotsAction()`/`fetchRecurringDataAction()` all return
 * packed ciphertext now, decrypted here and (except snapshots, which is a
 * flat list) run through `computeGoalsData()`/`computeLoansData()`/
 * `computeInvestmentsData()`/`computeRecurringData()` — mirroring how
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
  decryptRecurringRows,
  decryptSnapshotRows,
} from "./decrypt";
import {
  backfillGoalRows,
  backfillInvestmentRows,
  backfillLoanRows,
  backfillRecurringRuleRows,
  backfillSnapshotRows,
} from "@/lib/vault/backfill-actions";
import { computeGoalsData } from "@/lib/goals/compute";
import { computeLoansData } from "@/lib/loans/compute";
import { computeInvestmentsData } from "@/lib/investments/compute";
import { computeRecurringData } from "@/lib/recurring/compute";
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

      const [rawGoals, rawLoans, rawInvestments, rawRecurring, rawSnapshots] =
        await Promise.all([
          fetchGoalsDataAction(),
          fetchLoansDataAction(),
          fetchInvestmentsDataAction(),
          fetchRecurringDataAction(),
          fetchNetWorthSnapshotsAction(),
        ]);

      const [
        goalRowsResult,
        loanRowsResult,
        investmentRowsResult,
        recurringRowsResult,
        snapshotRowsResult,
      ] = await Promise.all([
        decryptGoalRows(rawGoals, dek),
        decryptLoanRows(rawLoans, dek),
        decryptInvestmentRows(rawInvestments, dek),
        decryptRecurringRows(rawRecurring, dek),
        decryptSnapshotRows(rawSnapshots, dek),
      ]);

      // Phase 3.5.7 "Backfill" — see use-finance-data.ts's identical
      // comment; same fire-and-forget re-encryption of recovered legacy
      // plaintext rows.
      if (goalRowsResult.backfill.length) backfillGoalRows(goalRowsResult.backfill).catch(() => {});
      if (loanRowsResult.backfill.length) backfillLoanRows(loanRowsResult.backfill).catch(() => {});
      if (investmentRowsResult.backfill.length) {
        backfillInvestmentRows(investmentRowsResult.backfill).catch(() => {});
      }
      if (recurringRowsResult.backfill.length) {
        backfillRecurringRuleRows(recurringRowsResult.backfill).catch(() => {});
      }
      if (snapshotRowsResult.backfill.length) {
        backfillSnapshotRows(snapshotRowsResult.backfill).catch(() => {});
      }

      const goalsData = computeGoalsData(goalRowsResult.rows, currency);
      const loansData = computeLoansData(loanRowsResult.rows, currency);
      const investmentsData = computeInvestmentsData(investmentRowsResult.rows, currency);
      const recurringData = computeRecurringData(recurringRowsResult.rows, currency);

      return {
        goalsData,
        loansData,
        investmentsData,
        recurringData,
        snapshots: snapshotRowsResult.rows,
        failedGoalCount: goalRowsResult.failedCount,
        failedLoanCount: loanRowsResult.failedCount,
        failedInvestmentCount: investmentRowsResult.failedCount,
        failedRecurringCount: recurringRowsResult.failedCount,
        failedSnapshotCount: snapshotRowsResult.failedCount,
      };
    },
  });
}
