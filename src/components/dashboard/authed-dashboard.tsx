"use client";

import { ShieldAlert } from "lucide-react";

import { DashboardView } from "./dashboard-view";
import { PageHeaderSkeleton, StatTilesSkeleton, CardGridSkeleton } from "@/components/skeletons";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { useSideData } from "@/lib/finance/use-side-data";
import { useVaultStore } from "@/lib/vault/store";
import { computeDashboardData } from "@/lib/dashboard/compute";
import type { CurrencyCode } from "@/lib/format";

export function AuthedDashboard({
  userName,
  currency,
}: {
  userName: string;
  currency: CurrencyCode;
}) {
  const dek = useVaultStore((s) => s.dek);
  const finance = useFinanceData(currency);
  const side = useSideData(currency);

  if (!dek) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-4 text-sm text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          Unlock your vault in Settings → Vault & Encryption to see your
          dashboard.
        </p>
      </div>
    );
  }

  if (finance.isLoading || side.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeaderSkeleton />
        <StatTilesSkeleton count={4} />
        <CardGridSkeleton />
      </div>
    );
  }

  if (finance.isError || side.isError || !finance.data || !side.data) {
    const err = finance.error ?? side.error;
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-sm text-negative">
          {err instanceof Error ? err.message : "Couldn't load your dashboard."}
        </p>
      </div>
    );
  }

  const d = computeDashboardData({
    userName,
    currency,
    budgets: finance.data.budgets,
    analytics: finance.data.analytics,
    transactions: finance.data.transactions,
    goalsData: side.data.goalsData,
    loansData: side.data.loansData,
    investmentsData: side.data.investmentsData,
    recurringData: side.data.recurringData,
    snapshots: side.data.snapshots,
  });

  return <DashboardView d={d} />;
}
