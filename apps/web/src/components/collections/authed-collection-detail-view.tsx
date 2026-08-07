"use client";

import { CollectionDetailView } from "./collection-detail-view";
import { DecryptProgress } from "@/components/finance/decrypt-progress";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { useCollectionsData, COLLECTIONS_PROGRESS_KEY } from "@/lib/collections/use-collections-data";
import { useDecryptProgress } from "@/lib/finance/decrypt-progress";
import { useDelayedLoading } from "@/lib/finance/use-delayed-loading";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { CategoryOption, AccountOption } from "@/lib/transactions/reference";

/** Same underlying `useCollectionsData` query the list page runs — the
 * detail page just picks one collection out of it, so navigating between
 * `/collections` and `/collections/[id]` is instant off a warm cache
 * instead of re-fetching+re-decrypting per collection. */
export function AuthedCollectionDetailView({
  collectionId,
  currency,
  categories,
  expenseCategories,
  accounts,
}: {
  collectionId: string;
  currency: CurrencyCode;
  categories: CategoryOption[];
  expenseCategories: CategoryOption[];
  accounts: AccountOption[];
}) {
  const dek = useVaultStore((s) => s.dek);
  const data = useCollectionsData(currency, categories);
  const showLoading = useDelayedLoading(data.isLoading);
  const progress = useDecryptProgress([COLLECTIONS_PROGRESS_KEY]);

  if (!dek) {
    return <VaultLockedPrompt module="this collection" />;
  }

  if (showLoading) {
    return <DecryptProgress percent={progress.percent} indeterminate={!progress.known} />;
  }

  if (data.isError || !data.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-negative">
          {data.error instanceof Error ? data.error.message : "Couldn't load this collection."}
        </p>
      </div>
    );
  }

  const collection = data.data.collectionsData.collections.find((c) => c.id === collectionId);
  if (!collection) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 py-14 text-center">
        <p className="text-sm text-muted-foreground">
          That collection doesn&apos;t exist, or was deleted.
        </p>
      </div>
    );
  }

  return (
    <CollectionDetailView collection={collection} dek={dek} expenseCategories={expenseCategories} accounts={accounts} />
  );
}
