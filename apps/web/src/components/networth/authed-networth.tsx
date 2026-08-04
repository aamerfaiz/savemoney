"use client";

import { NetWorthView } from "./networth-view";
import { DecryptProgress } from "@/components/finance/decrypt-progress";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { useSideData } from "@/lib/finance/use-side-data";
import { useDecryptProgress } from "@/lib/finance/decrypt-progress";
import { useDelayedLoading } from "@/lib/finance/use-delayed-loading";
import { useVaultStore } from "@/lib/vault/store";
import { buildNetWorth } from "@/lib/networth/compute";
import type { CurrencyCode } from "@savemoney/finance-engine/format";

export function AuthedNetWorth({ currency }: { currency: CurrencyCode }) {
  const dek = useVaultStore((s) => s.dek);
  const finance = useFinanceData(currency);
  const side = useSideData(currency);
  const showLoading = useDelayedLoading(finance.isLoading || side.isLoading);
  const progress = useDecryptProgress(["finance-data", "finance-side-data"]);

  if (!dek) {
    return <VaultLockedPrompt module="your net worth" />;
  }

  if (showLoading) {
    return <DecryptProgress percent={progress.percent} indeterminate={!progress.known} />;
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

  return <NetWorthView data={nw} dek={dek} />;
}
