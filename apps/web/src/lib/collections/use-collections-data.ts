"use client";

/**
 * Collections' own decrypt+compute hook — deliberately NOT folded into
 * `useSideData` (src/lib/finance/use-side-data.ts). That hook bundles goals/
 * loans/investments/recurring/snapshots because all of them feed the budget
 * engine's safe-to-spend calculation; Collections never does (it's other
 * people's money passing through a pool, not the user's own income or
 * spending), so it gets a standalone TanStack Query entry instead of adding
 * dead weight to every dashboard/budget load.
 */

import { useQuery } from "@tanstack/react-query";

import { fetchCollectionsDataAction } from "./side-data";
import {
  decryptCollectionRows,
  decryptCollectionContributionRows,
} from "@/lib/finance/decrypt";
import { useDecryptProgressStore, withProgress } from "@/lib/finance/decrypt-progress";
import { computeCollectionsData } from "./compute";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@savemoney/finance-engine/format";

export const COLLECTIONS_PROGRESS_KEY = "collections-data";

export function useCollectionsData(currency: CurrencyCode) {
  const dek = useVaultStore((s) => s.dek);

  return useQuery({
    queryKey: ["collections-data"],
    enabled: !!dek,
    retry: false,
    queryFn: async () => {
      if (!dek) throw new Error("Vault is locked.");

      const { collections: rawCollections, contributions: rawContributions } =
        await fetchCollectionsDataAction();

      useDecryptProgressStore
        .getState()
        .startChunk(COLLECTIONS_PROGRESS_KEY, rawCollections.length + rawContributions.length);

      const [collectionRowsResult, contributionRowsResult] = await Promise.all([
        withProgress(
          COLLECTIONS_PROGRESS_KEY,
          rawCollections.length,
          decryptCollectionRows(rawCollections, dek),
        ),
        withProgress(
          COLLECTIONS_PROGRESS_KEY,
          rawContributions.length,
          decryptCollectionContributionRows(rawContributions, dek),
        ),
      ]);

      const collectionsData = computeCollectionsData(
        collectionRowsResult.rows,
        contributionRowsResult.rows,
        currency,
      );

      return {
        collectionsData,
        failedCollectionCount: collectionRowsResult.failedCount,
        failedContributionCount: contributionRowsResult.failedCount,
      };
    },
  });
}
