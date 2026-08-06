/**
 * Pure collections computation — takes already-decrypted rows (only the
 * browser, with the vault unlocked, can decrypt contributor names/amounts)
 * and groups contributions under their collection, deriving each summary via
 * the shared `computeCollectionSummary` engine. No I/O, no "server-only".
 */

import { computeCollectionSummary } from "@savemoney/finance-engine/collections";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type {
  DecryptedCollectionRow,
  DecryptedCollectionContributionRow,
} from "@/lib/finance/decrypt";
import type { CollectionStatus, CollectionWithProgress } from "./types";

export interface CollectionsData {
  collections: CollectionWithProgress[];
  totalCollectedAcrossAll: number;
  currency: CurrencyCode;
}

export function computeCollectionsData(
  collectionRows: DecryptedCollectionRow[],
  contributionRows: DecryptedCollectionContributionRow[],
  currency: CurrencyCode,
): CollectionsData {
  const byCollection = new Map<string, DecryptedCollectionContributionRow[]>();
  for (const c of contributionRows) {
    const list = byCollection.get(c.collectionId) ?? [];
    list.push(c);
    byCollection.set(c.collectionId, list);
  }

  const collections: CollectionWithProgress[] = collectionRows.map((c) => {
    const contributions = byCollection.get(c.id) ?? [];
    const summary = computeCollectionSummary(
      contributions.map((ct) => ({ amount: ct.amount })),
      c.targetAmount,
    );
    return {
      id: c.id,
      title: c.title,
      purpose: c.purpose,
      icon: c.icon,
      targetAmount: c.targetAmount,
      // Display in the user's base currency (no conversion yet).
      currency,
      eventDate: c.eventDate,
      status: c.status as CollectionStatus,
      payoutAmount: c.payoutAmount,
      payoutAt: c.payoutAt,
      payoutNote: c.payoutNote,
      contributors: contributions
        .map((ct) => ({
          id: ct.id,
          contributorName: ct.contributorName,
          amount: ct.amount,
          contributedAt: ct.contributedAt,
          method: ct.method,
          note: ct.note,
        }))
        .sort((a, b) => (a.contributedAt < b.contributedAt ? 1 : -1)),
      summary,
    };
  });

  collections.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return 0;
  });

  const totalCollectedAcrossAll = collections
    .filter((c) => c.status === "open")
    .reduce((sum, c) => sum + c.summary.totalCollected, 0);

  return { collections, totalCollectedAcrossAll, currency };
}
