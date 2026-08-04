"use client";

import { ReportsView } from "./reports-view";
import { DecryptProgress } from "@/components/finance/decrypt-progress";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { useSideData } from "@/lib/finance/use-side-data";
import { useDecryptProgress } from "@/lib/finance/decrypt-progress";
import { useDelayedLoading } from "@/lib/finance/use-delayed-loading";
import { useVaultStore } from "@/lib/vault/store";
import { computeReportsData } from "@/lib/reports/compute";
import type { CurrencyCode } from "@savemoney/finance-engine/format";

export function AuthedReports({ currency }: { currency: CurrencyCode }) {
  const dek = useVaultStore((s) => s.dek);
  const finance = useFinanceData(currency);
  const side = useSideData(currency);
  const showLoading = useDelayedLoading(finance.isLoading || side.isLoading);
  const progress = useDecryptProgress(["finance-data", "finance-side-data"]);

  if (!dek) {
    return <VaultLockedPrompt module="your reports" />;
  }

  if (showLoading) {
    return <DecryptProgress percent={progress.percent} indeterminate={!progress.known} />;
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
