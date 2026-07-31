"use client";

import { ShieldAlert } from "lucide-react";

import { GoalsView } from "./goals-view";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";
import { useSideData } from "@/lib/finance/use-side-data";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@/lib/format";

/** The real (non-guest) Goals page's client boundary (Phase 3.5.4) — goals
 * amounts are encrypted now, so this mirrors AuthedBudgetsView/
 * AuthedTransactionsView rather than the old server-component page. */
export function AuthedGoalsView({ currency }: { currency: CurrencyCode }) {
  const dek = useVaultStore((s) => s.dek);
  const side = useSideData(currency);

  if (!dek) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-4 text-sm text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          Unlock your vault in Settings → Vault & Encryption to see your
          goals.
        </p>
      </div>
    );
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
