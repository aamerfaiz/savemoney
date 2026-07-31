"use client";

import { ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { NotificationsView } from "./notifications-view";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { fetchBillCalendarAction, fetchGoalsDataAction, fetchLoansDataAction } from "@/lib/finance/side-data";
import { decryptGoalRows } from "@/lib/finance/decrypt";
import { fetchNotificationStateAction } from "@/lib/notifications/actions";
import { computeNotificationsData } from "@/lib/notifications/compute";
import { computeGoalsData } from "@/lib/goals/compute";
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

      const [calendar, rawGoals, loans, state] = await Promise.all([
        fetchBillCalendarAction(),
        fetchGoalsDataAction(),
        fetchLoansDataAction(),
        fetchNotificationStateAction(),
      ]);
      const goalRowsResult = await decryptGoalRows(rawGoals, dek);
      const goals = computeGoalsData(goalRowsResult.rows, currency);
      return { calendar, goals, loans, state };
    },
  });

  if (!dek) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-4 text-sm text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          Unlock your vault in Settings → Vault & Encryption to see your
          notifications.
        </p>
      </div>
    );
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
