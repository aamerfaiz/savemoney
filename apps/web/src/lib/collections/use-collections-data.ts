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
  decryptCollectionContributorRows,
  decryptCollectionContributionRows,
  decryptCollectionExpenseRows,
  decryptCollectionExpensePayerRows,
  decryptCollectionExpenseSplitRows,
  decryptCollectionSettlementRows,
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
        contributors: rawContributors,
        contributions: rawContributions,
        expenses: rawExpenses,
        expensePayers: rawExpensePayers,
        expenseSplits: rawExpenseSplits,
        settlements: rawSettlements,
      } = await fetchCollectionsDataAction();

      const totalRows =
        rawCollections.length +
        rawContributors.length +
        rawContributions.length +
        rawExpenses.length +
        rawExpensePayers.length +
        rawExpenseSplits.length +
        rawSettlements.length;
      useDecryptProgressStore.getState().startChunk(COLLECTIONS_PROGRESS_KEY, totalRows);

      const [
        collectionRowsResult,
        contributorRowsResult,
        contributionRowsResult,
        expenseRowsResult,
        expensePayerRowsResult,
        expenseSplitRowsResult,
        settlementRowsResult,
      ] = await Promise.all([
        withProgress(
          COLLECTIONS_PROGRESS_KEY,
          rawCollections.length,
          decryptCollectionRows(rawCollections, dek),
        ),
        withProgress(
          COLLECTIONS_PROGRESS_KEY,
          rawContributors.length,
          decryptCollectionContributorRows(rawContributors, dek),
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
        withProgress(
          COLLECTIONS_PROGRESS_KEY,
          rawExpensePayers.length,
          decryptCollectionExpensePayerRows(rawExpensePayers, dek),
        ),
        withProgress(
          COLLECTIONS_PROGRESS_KEY,
          rawExpenseSplits.length,
          decryptCollectionExpenseSplitRows(rawExpenseSplits, dek),
        ),
        withProgress(
          COLLECTIONS_PROGRESS_KEY,
          rawSettlements.length,
          decryptCollectionSettlementRows(rawSettlements, dek),
        ),
      ]);

      const collectionsData = computeCollectionsData(
        collectionRowsResult.rows,
        contributorRowsResult.rows,
        contributionRowsResult.rows,
        expenseRowsResult.rows,
        expensePayerRowsResult.rows,
        expenseSplitRowsResult.rows,
        settlementRowsResult.rows,
        categories,
        currency,
      );

      return {
        collectionsData,
        failedCollectionCount: collectionRowsResult.failedCount,
        failedContributorCount: contributorRowsResult.failedCount,
        failedContributionCount: contributionRowsResult.failedCount,
        failedExpenseCount: expenseRowsResult.failedCount,
      };
    },
  });
}
