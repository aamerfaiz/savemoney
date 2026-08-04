"use client";

import { GoalsView } from "./goals-view";
import { DecryptProgress } from "@/components/finance/decrypt-progress";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { useSideData } from "@/lib/finance/use-side-data";
import { useDecryptProgress } from "@/lib/finance/decrypt-progress";
import { useDelayedLoading } from "@/lib/finance/use-delayed-loading";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@/lib/format";

/** The real (non-guest) Goals page's client boundary (Phase 3.5.4) — goals
 * amounts are encrypted now, so this mirrors AuthedBudgetsView/
 * AuthedTransactionsView rather than the old server-component page. */
export function AuthedGoalsView({ currency }: { currency: CurrencyCode }) {
  const dek = useVaultStore((s) => s.dek);
  const side = useSideData(currency);
  const showLoading = useDelayedLoading(side.isLoading);
  const progress = useDecryptProgress(["finance-side-data"]);

  if (!dek) {
    return <VaultLockedPrompt module="your goals" />;
  }

  if (showLoading) {
    return <DecryptProgress percent={progress.percent} indeterminate={!progress.known} />;
  }

  if (side.isError || !side.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-negative">
          {side.error instanceof Error ? side.error.message : "Couldn't load your goals."}
        </p>
      </div>
    );
  }

  return (
    <GoalsView
      data={side.data.goalsData}
      dek={dek}
      failedCount={side.data.failedGoalCount}
    />
  );
}
