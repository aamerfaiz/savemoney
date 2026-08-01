"use client";

import { ReportsView } from "./reports-view";
import { PageHeaderSkeleton, CardSkeleton } from "@/components/skeletons";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { useSideData } from "@/lib/finance/use-side-data";
import { useVaultStore } from "@/lib/vault/store";
import { computeReportsData } from "@/lib/reports/compute";
import type { CurrencyCode } from "@/lib/format";

export function AuthedReports({ currency }: { currency: CurrencyCode }) {
  const dek = useVaultStore((s) => s.dek);
  const finance = useFinanceData(currency);
  const side = useSideData(currency);

  if (!dek) {
    return <VaultLockedPrompt module="your reports" />;
  }

  if (finance.isLoading || side.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeaderSkeleton />
        <CardSkeleton className="h-64" />
      </div>
    );
  }

  if (finance.isError || side.isError || !finance.data || !side.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-negative">Couldn&apos;t load your reports.</p>
      </div>
    );
  }

  const data = computeReportsData({
    analytics: finance.data.analytics,
    investmentsData: side.data.investmentsData,
    goalsData: side.data.goalsData,
    loansData: side.data.loansData,
    snapshots: side.data.snapshots,
  });

  return <ReportsView data={data} />;
}
