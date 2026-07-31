"use client";

import { ShieldAlert } from "lucide-react";

import { NetWorthView } from "./networth-view";
import { PageHeaderSkeleton, CardSkeleton } from "@/components/skeletons";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { useSideData } from "@/lib/finance/use-side-data";
import { useVaultStore } from "@/lib/vault/store";
import { buildNetWorth } from "@/lib/networth/compute";
import type { CurrencyCode } from "@/lib/format";

export function AuthedNetWorth({ currency }: { currency: CurrencyCode }) {
  const dek = useVaultStore((s) => s.dek);
  const finance = useFinanceData(currency);
  const side = useSideData();

  if (!dek) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-4 text-sm text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          Unlock your vault in Settings → Vault & Encryption to see your net
          worth.
        </p>
      </div>
    );
  }

  if (finance.isLoading || side.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeaderSkeleton />
        <CardSkeleton className="h-64" />
      </div>
    );
  }

  if (finance.isError || side.isError || !finance.data || !side.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-negative">Couldn&apos;t load your net worth.</p>
      </div>
    );
  }

  const nw = buildNetWorth({
    components: {
      investmentsValue: side.data.investmentsData.totalValue,
      goalsSaved: side.data.goalsData.totalSaved,
      loansRemaining: side.data.loansData.totalRemaining,
    },
    months: finance.data.analytics.months,
    snapshots: side.data.snapshots,
    currency,
  });

  return <NetWorthView data={nw} />;
}
