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
  decryptCollectionParticipantRows,
  decryptCollectionContributionRows,
  decryptCollectionExpenseRows,
} from "@/lib/finance/decrypt";
import { useDecryptProgressStore, withProgress } from "@/lib/finance/decrypt-progress";
import { computeCollectionsData, type CategoryLookup } from "./compute";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@savemoney/finance-engine/format";

export const COLLECTIONS_PROGRESS_KEY = "collections-data";

export function useCollectionsData(currency: CurrencyCode, categories: CategoryLookup[] = []) {
  const dek = useVaultStore((s) => s.dek);

  return useQuery({
    queryKey: ["collections-data"],
    enabled: !!dek,
    retry: false,
    queryFn: async () => {
      if (!dek) throw new Error("Vault is locked.");

      const {
        collections: rawCollections,
        participants: rawParticipants,
        contributions: rawContributions,
        expenses: rawExpenses,
      } = await fetchCollectionsDataAction();

      const totalRows =
        rawCollections.length + rawParticipants.length + rawContributions.length + rawExpenses.length;
      useDecryptProgressStore.getState().startChunk(COLLECTIONS_PROGRESS_KEY, totalRows);

      const [collectionRowsResult, participantRowsResult, contributionRowsResult, expenseRowsResult] =
        await Promise.all([
          withProgress(
            COLLECTIONS_PROGRESS_KEY,
            rawCollections.length,
            decryptCollectionRows(rawCollections, dek),
          ),
          withProgress(
            COLLECTIONS_PROGRESS_KEY,
            rawParticipants.length,
            decryptCollectionParticipantRows(rawParticipants, dek),
          ),
          withProgress(
            COLLECTIONS_PROGRESS_KEY,
            rawContributions.length,
            decryptCollectionContributionRows(rawContributions, dek),
          ),
          withProgress(
            COLLECTIONS_PROGRESS_KEY,
            rawExpenses.length,
            decryptCollectionExpenseRows(rawExpenses, dek),
          ),
        ]);

      const collectionsData = computeCollectionsData(
        collectionRowsResult.rows,
        participantRowsResult.rows,
        contributionRowsResult.rows,
        expenseRowsResult.rows,
        categories,
        currency,
      );

      return {
        collectionsData,
        failedCollectionCount: collectionRowsResult.failedCount,
        failedParticipantCount: participantRowsResult.failedCount,
        failedContributionCount: contributionRowsResult.failedCount,
        failedExpenseCount: expenseRowsResult.failedCount,
      };
    },
  });
}
