"use server";

/** Thin client-callable wrapper around the raw-ciphertext query functions —
 * mirrors src/lib/finance/side-data.ts's `fetchGoalsDataAction` etc. Kept in
 * its own file (rather than added to that shared one) since Collections
 * doesn't feed the budget engine and has no reason to be bundled into
 * `useSideData`'s single query — see use-collections-data.ts. */

import {
  fetchCollectionsRaw,
  fetchCollectionContributorsRaw,
  fetchCollectionContributionsRaw,
  fetchCollectionExpensesRaw,
  fetchCollectionExpensePayersRaw,
  fetchCollectionExpenseSplitsRaw,
  fetchCollectionSettlementsRaw,
} from "./queries";

export async function fetchCollectionsDataAction() {
  const [collections, contributors, contributions, expenses, expensePayers, expenseSplits, settlements] =
    await Promise.all([
      fetchCollectionsRaw(),
      fetchCollectionContributorsRaw(),
      fetchCollectionContributionsRaw(),
      fetchCollectionExpensesRaw(),
      fetchCollectionExpensePayersRaw(),
      fetchCollectionExpenseSplitsRaw(),
      fetchCollectionSettlementsRaw(),
    ]);
  return { collections, contributors, contributions, expenses, expensePayers, expenseSplits, settlements };
}
