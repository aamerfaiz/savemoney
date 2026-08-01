"use client";

import { LoansView } from "./loans-view";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { useSideData } from "@/lib/finance/use-side-data";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@/lib/format";

/** The real (non-guest) Loans page's client boundary (Phase 3.5.4) — loan
 * amounts are encrypted now, so this mirrors AuthedGoalsView rather than
 * the old server-component page. */
export function AuthedLoansView({ currency }: { currency: CurrencyCode }) {
  const dek = useVaultStore((s) => s.dek);
  const side = useSideData(currency);

  if (!dek) {
    return <VaultLockedPrompt module="your loans" />;
  }

  if (side.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeaderSkeleton />
        <RowsSkeleton />
      </div>
    );
  }

  if (side.isError || !side.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-negative">
          {side.error instanceof Error ? side.error.message : "Couldn't load your loans."}
        </p>
      </div>
    );
  }

  return (
    <LoansView
      data={side.data.loansData}
      dek={dek}
      failedCount={side.data.failedLoanCount}
    />
  );
}
