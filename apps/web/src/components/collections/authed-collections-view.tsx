"use client";

import { CollectionsView } from "./collections-view";
import { DecryptProgress } from "@/components/finance/decrypt-progress";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { useCollectionsData, COLLECTIONS_PROGRESS_KEY } from "@/lib/collections/use-collections-data";
import { useDecryptProgress } from "@/lib/finance/decrypt-progress";
import { useDelayedLoading } from "@/lib/finance/use-delayed-loading";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { CategoryOption, AccountOption } from "@/lib/transactions/reference";

/** The real (non-guest) Collections page's client boundary — mirrors
 * AuthedGoalsView: contributor names/amounts are encrypted, so the fetch +
 * decrypt has to happen client-side once the vault is unlocked. */
export function AuthedCollectionsView({
  currency,
  expenseCategories,
  accounts,
}: {
  currency: CurrencyCode;
  expenseCategories: CategoryOption[];
  accounts: AccountOption[];
}) {
  const dek = useVaultStore((s) => s.dek);
  const data = useCollectionsData(currency);
  const showLoading = useDelayedLoading(data.isLoading);
  const progress = useDecryptProgress([COLLECTIONS_PROGRESS_KEY]);

  if (!dek) {
    return <VaultLockedPrompt module="your collections" />;
  }

  if (showLoading) {
    return <DecryptProgress percent={progress.percent} indeterminate={!progress.known} />;
  }

  if (data.isError || !data.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-negative">
          {data.error instanceof Error ? data.error.message : "Couldn't load your collections."}
        </p>
      </div>
    );
  }

  return (
    <CollectionsView
      data={data.data.collectionsData}
      dek={dek}
      failedCount={data.data.failedCollectionCount + data.data.failedContributionCount}
      expenseCategories={expenseCategories}
      accounts={accounts}
    />
  );
}
