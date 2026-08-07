/**
 * Pure collections computation — takes already-decrypted rows (only the
 * browser, with the vault unlocked, can decrypt participant names/amounts)
 * and assembles each collection's roster, contributions, expenses, and
 * derived summary. No I/O, no "server-only".
 */

import { computeCollectionSummary } from "@savemoney/finance-engine/collections";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type {
  DecryptedCollectionRow,
  DecryptedCollectionParticipantRow,
  DecryptedCollectionContributionRow,
  DecryptedCollectionExpenseRow,
} from "@/lib/finance/decrypt";
import type {
  CollectionStatus,
  CollectionWithProgress,
  CollectionParticipant,
  CollectionContributionRow,
  CollectionExpenseRow,
} from "./types";

export interface CollectionsData {
  collections: CollectionWithProgress[];
  currency: CurrencyCode;
}

export interface CategoryLookup {
  id: string;
  name: string;
  icon: string | null;
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}

export function computeCollectionsData(
  collectionRows: DecryptedCollectionRow[],
  participantRows: DecryptedCollectionParticipantRow[],
  contributionRows: DecryptedCollectionContributionRow[],
  expenseRows: DecryptedCollectionExpenseRow[],
  categories: CategoryLookup[],
  currency: CurrencyCode,
): CollectionsData {
  const participantsByCollection = groupBy(participantRows, (p) => p.collectionId);
  const contributionsByCollection = groupBy(contributionRows, (c) => c.collectionId);
  const expensesByCollection = groupBy(expenseRows, (e) => e.collectionId);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const collections: CollectionWithProgress[] = collectionRows.map((c) => {
    const rawParticipants = participantsByCollection.get(c.id) ?? [];
    const rawContributions = contributionsByCollection.get(c.id) ?? [];
    const rawExpenses = expensesByCollection.get(c.id) ?? [];
    const participantNameById = new Map(rawParticipants.map((p) => [p.id, p.displayName]));

    const contributedByParticipant = new Map<string, number>();
    const contributions: CollectionContributionRow[] = rawContributions
      .map((ct) => {
        const resolvedName = ct.participantId
          ? (participantNameById.get(ct.participantId) ?? "Unknown")
          : (ct.contributorName ?? "Unknown");
        if (ct.participantId) {
          contributedByParticipant.set(
            ct.participantId,
            (contributedByParticipant.get(ct.participantId) ?? 0) + ct.amount,
          );
        }
        return {
          id: ct.id,
          participantId: ct.participantId,
          contributorName: resolvedName,
          amount: ct.amount,
          contributedAt: ct.contributedAt,
          method: ct.method,
          note: ct.note,
          isLegacy: ct.participantId === null,
        };
      })
      .sort((a, b) => (a.contributedAt < b.contributedAt ? 1 : -1));

    const participants: CollectionParticipant[] = rawParticipants
      .map((p) => ({
        id: p.id,
        displayName: p.displayName,
        linkedUserId: p.linkedUserId,
        totalContributed: contributedByParticipant.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.totalContributed - a.totalContributed);

    const expenses: CollectionExpenseRow[] = rawExpenses
      .map((e) => {
        const category = e.categoryId ? categoryMap.get(e.categoryId) : undefined;
        return {
          id: e.id,
          amount: e.amount,
          description: e.description,
          categoryId: e.categoryId,
          categoryName: category?.name ?? null,
          categoryIcon: category?.icon ?? null,
          paidByParticipantId: e.paidByParticipantId,
          paidByName: e.paidByParticipantId
            ? (participantNameById.get(e.paidByParticipantId) ?? null)
            : null,
          spentAt: e.spentAt,
          linkedTransactionId: e.linkedTransactionId,
        };
      })
      .sort((a, b) => (a.spentAt < b.spentAt ? 1 : -1));

    const summary = computeCollectionSummary(
      contributions.map((ct) => ({ amount: ct.amount })),
      expenses.map((e) => ({ amount: e.amount })),
      c.targetAmount,
    );

    return {
      id: c.id,
      title: c.title,
      purpose: c.purpose,
      icon: c.icon,
      targetAmount: c.targetAmount,
      // Display every collection in the user's base currency (no
      // conversion yet).
      currency,
      eventDate: c.eventDate,
      status: c.status as CollectionStatus,
      participants,
      contributions,
      expenses,
      summary,
    };
  });

  collections.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return 0;
  });

  return { collections, currency };
}
