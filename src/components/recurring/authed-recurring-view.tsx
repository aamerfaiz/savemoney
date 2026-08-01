"use client";

import { RecurringView } from "./recurring-view";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { useSideData } from "@/lib/finance/use-side-data";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@/lib/format";
import type { AccountOption, CategoryOption } from "@/lib/transactions/reference";

/** The real (non-guest) Recurring page's client boundary (Phase 3.5.4) —
 * rule amounts are encrypted now, so this mirrors AuthedGoalsView/
 * AuthedLoansView/AuthedInvestmentsView rather than the old
 * server-component page. */
export function AuthedRecurringView({
  categories,
  accounts,
  currency,
}: {
  categories: CategoryOption[];
  accounts: AccountOption[];
  currency: CurrencyCode;
}) {
  const dek = useVaultStore((s) => s.dek);
  const side = useSideData(currency);

  if (!dek) {
    return <VaultLockedPrompt module="your recurring rules" />;
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
          {side.error instanceof Error ? side.error.message : "Couldn't load your recurring rules."}
        </p>
      </div>
    );
  }

  return (
    <RecurringView
      data={side.data.recurringData}
      categories={categories}
      accounts={accounts}
      dek={dek}
      failedCount={side.data.failedRecurringCount}
    />
  );
}
