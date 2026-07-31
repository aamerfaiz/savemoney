"use client";

/**
 * Goals/loans/investments/recurring/net-worth-snapshots — none of this is
 * encrypted (Phase 3.5.3 scope is income/expenses only), but Dashboard, Net
 * Worth, Reports, and Notifications all compose it together with the
 * now-client-side budgets/analytics, so it has to be fetchable from the
 * same client context. Cached by TanStack Query like useFinanceData.
 */

import { useQuery } from "@tanstack/react-query";

import {
  fetchGoalsDataAction,
  fetchInvestmentsDataAction,
  fetchLoansDataAction,
  fetchNetWorthSnapshotsAction,
  fetchRecurringDataAction,
} from "./side-data";

export function useSideData() {
  return useQuery({
    queryKey: ["finance-side-data"],
    retry: false,
    queryFn: async () => {
      const [goalsData, loansData, investmentsData, recurringData, snapshots] =
        await Promise.all([
          fetchGoalsDataAction(),
          fetchLoansDataAction(),
          fetchInvestmentsDataAction(),
          fetchRecurringDataAction(),
          fetchNetWorthSnapshotsAction(),
        ]);
      return { goalsData, loansData, investmentsData, recurringData, snapshots };
    },
  });
}
