"use client";

import { useQuery } from "@tanstack/react-query";

import { NotificationsView } from "./notifications-view";
import { DecryptProgress } from "@/components/finance/decrypt-progress";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import {
  fetchBillCalendarAction,
  fetchGoalsDataAction,
  fetchLoansDataAction,
  fetchRecurringDataAction,
} from "@/lib/finance/side-data";
import { decryptGoalRows, decryptLoanRows, decryptRecurringRows } from "@/lib/finance/decrypt";
import { useDecryptProgress, useDecryptProgressStore, withProgress } from "@/lib/finance/decrypt-progress";
import { useDelayedLoading } from "@/lib/finance/use-delayed-loading";
import { fetchNotificationStateAction } from "@/lib/notifications/actions";
import { computeNotificationsData } from "@/lib/notifications/compute";
import { computeGoalsData } from "@/lib/goals/compute";
import { computeLoansData } from "@/lib/loans/compute";
import { computeRecurringData } from "@/lib/recurring/compute";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@savemoney/finance-engine/format";

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
      useDecryptProgressStore
        .getState()
        .startChunk("notifications-extras", rawGoals.length + rawLoans.length + rawRecurring.length);
      const [goalRowsResult, loanRowsResult, recurringRowsResult] = await Promise.all([
        withProgress("notifications-extras", rawGoals.length, decryptGoalRows(rawGoals, dek)),
        withProgress("notifications-extras", rawLoans.length, decryptLoanRows(rawLoans, dek)),
        withProgress(
          "notifications-extras",
          rawRecurring.length,
          decryptRecurringRows(rawRecurring, dek),
        ),
      ]);
      const goals = computeGoalsData(goalRowsResult.rows, currency);
      const loans = computeLoansData(loanRowsResult.rows, currency);
      const recurring = computeRecurringData(recurringRowsResult.rows, currency);
      const calendar = await fetchBillCalendarAction(loans.loans, recurring.rules);
      return { calendar, goals, loans, state };
    },
  });

  const showLoading = useDelayedLoading(finance.isLoading || extras.isLoading);
  const progress = useDecryptProgress(["finance-data", "notifications-extras"]);

  if (!dek) {
    return <VaultLockedPrompt module="your notifications" />;
  }

  if (showLoading) {
    return <DecryptProgress percent={progress.percent} indeterminate={!progress.known} />;
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
