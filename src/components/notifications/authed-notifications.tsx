"use client";

import { useQuery } from "@tanstack/react-query";

import { NotificationsView } from "./notifications-view";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import {
  fetchBillCalendarAction,
  fetchGoalsDataAction,
  fetchLoansDataAction,
  fetchRecurringDataAction,
} from "@/lib/finance/side-data";
import { decryptGoalRows, decryptLoanRows, decryptRecurringRows } from "@/lib/finance/decrypt";
import { fetchNotificationStateAction } from "@/lib/notifications/actions";
import { computeNotificationsData } from "@/lib/notifications/compute";
import { computeGoalsData } from "@/lib/goals/compute";
import { computeLoansData } from "@/lib/loans/compute";
import { computeRecurringData } from "@/lib/recurring/compute";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@/lib/format";

export function AuthedNotifications({ currency }: { currency: CurrencyCode }) {
  const dek = useVaultStore((s) => s.dek);
  const finance = useFinanceData(currency);
  const extras = useQuery({
    queryKey: ["notifications-extras"],
    enabled: !!dek,
    retry: false,
    queryFn: async () => {
      if (!dek) throw new Error("Vault is locked.");

      const [rawGoals, rawLoans, rawRecurring, state] = await Promise.all([
        fetchGoalsDataAction(),
        fetchLoansDataAction(),
        fetchRecurringDataAction(),
        fetchNotificationStateAction(),
      ]);
      const [goalRowsResult, loanRowsResult, recurringRowsResult] = await Promise.all([
        decryptGoalRows(rawGoals, dek),
        decryptLoanRows(rawLoans, dek),
        decryptRecurringRows(rawRecurring, dek),
      ]);
      const goals = computeGoalsData(goalRowsResult.rows, currency);
      const loans = computeLoansData(loanRowsResult.rows, currency);
      const recurring = computeRecurringData(recurringRowsResult.rows, currency);
      const calendar = await fetchBillCalendarAction(loans.loans, recurring.rules);
      return { calendar, goals, loans, state };
    },
  });

  if (!dek) {
    return <VaultLockedPrompt module="your notifications" />;
  }

  if (finance.isLoading || extras.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeaderSkeleton />
        <RowsSkeleton />
      </div>
    );
  }

  if (finance.isError || extras.isError || !finance.data || !extras.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-negative">Couldn&apos;t load your notifications.</p>
      </div>
    );
  }

  const data = computeNotificationsData({
    currency,
    calendar: extras.data.calendar,
    budgets: finance.data.budgets,
    goals: extras.data.goals,
    loans: extras.data.loans,
    state: extras.data.state,
  });

  return <NotificationsView data={data} dek={dek} />;
}
