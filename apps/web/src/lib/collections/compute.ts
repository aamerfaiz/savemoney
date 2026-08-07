/**
 * Pure collections computation — takes already-decrypted rows (only the
 * browser, with the vault unlocked, can decrypt contributor names/amounts)
 * and assembles each collection's roster, contributions, expenses, and
 * derived summary. No I/O, no "server-only".
 *
 * Pre-roster ("legacy") contributions — rows saved before the
 * `collection_contributors` table existed, which only have a plaintext-once-
 * decrypted `contributorName` and no `contributorId` — are folded directly
 * into the same `contributors` list as a synthesized entry per unique name
 * (`isLegacy: true`, `id: "legacy:<name>"`), grouped exactly like a real
 * contributor's rows would be. There is deliberately no separate "legacy"
 * list: from the UI's perspective it's one roster, with a "Link to roster"
 * action available on the entries that aren't a real row yet.
 */

import {
  computeCollectionSummary,
  computeTripBalances,
  simplifySettlements,
} from "@savemoney/finance-engine/collections";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type {
  DecryptedCollectionRow,
  DecryptedCollectionContributorRow,
  DecryptedCollectionContributionRow,
  DecryptedCollectionExpenseRow,
  DecryptedCollectionExpensePayerRow,
  DecryptedCollectionExpenseSplitRow,
  DecryptedCollectionSettlementRow,
} from "@/lib/finance/decrypt";
import type {
  CollectionStatus,
  CollectionType,
  CollectionWithProgress,
  CollectionContributor,
  CollectionContributionRow,
  CollectionExpenseRow,
  CollectionSettlementRow,
  ExpenseParty,
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

export const legacyContributorId = (name: string) => `legacy:${name.trim().toLowerCase()}`;

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
  contributorRows: DecryptedCollectionContributorRow[],
  contributionRows: DecryptedCollectionContributionRow[],
  expenseRows: DecryptedCollectionExpenseRow[],
  expensePayerRows: DecryptedCollectionExpensePayerRow[],
  expenseSplitRows: DecryptedCollectionExpenseSplitRow[],
  settlementRows: DecryptedCollectionSettlementRow[],
  categories: CategoryLookup[],
  currency: CurrencyCode,
): CollectionsData {
  const contributorsByCollection = groupBy(contributorRows, (p) => p.collectionId);
  const contributionsByCollection = groupBy(contributionRows, (c) => c.collectionId);
  const expensesByCollection = groupBy(expenseRows, (e) => e.collectionId);
  const payersByExpense = groupBy(expensePayerRows, (p) => p.expenseId);
  const splitsByExpense = groupBy(expenseSplitRows, (s) => s.expenseId);
  const settlementsByCollection = groupBy(settlementRows, (s) => s.collectionId);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const collections: CollectionWithProgress[] = collectionRows.map((c) => {
    const rawContributors = contributorsByCollection.get(c.id) ?? [];
    const rawContributions = contributionsByCollection.get(c.id) ?? [];
    const rawExpenses = expensesByCollection.get(c.id) ?? [];
    const nameById = new Map(rawContributors.map((p) => [p.id, p.displayName]));

    // Resolve every contribution to a stable contributor id — a real one
    // when `contributorId` is set, or a synthesized `legacy:<name>` one for
    // pre-roster rows, grouped by name.
    const contributions: CollectionContributionRow[] = rawContributions
      .map((ct) => {
        const resolvedId = ct.contributorId ?? legacyContributorId(ct.contributorName ?? "Unknown");
        const resolvedName = ct.contributorId
          ? (nameById.get(ct.contributorId) ?? "Unknown")
          : (ct.contributorName ?? "Unknown");
        return {
          id: ct.id,
          contributorId: resolvedId,
          contributorName: resolvedName,
          amount: ct.amount,
          contributedAt: ct.contributedAt,
          method: ct.method,
          note: ct.note,
        };
      })
      .sort((a, b) => (a.contributedAt < b.contributedAt ? 1 : -1));

    const totalsById = new Map<string, number>();
    for (const ct of contributions) {
      totalsById.set(ct.contributorId, (totalsById.get(ct.contributorId) ?? 0) + ct.amount);
    }

    const realContributors: CollectionContributor[] = rawContributors.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      linkedUserId: p.linkedUserId,
      totalContributed: totalsById.get(p.id) ?? 0,
      isLegacy: false,
    }));

    // One synthesized entry per unique legacy name that isn't already
    // covered by a real contributor row.
    const legacyNames = new Map<string, string>();
    for (const ct of rawContributions) {
      if (ct.contributorId || !ct.contributorName) continue;
      legacyNames.set(legacyContributorId(ct.contributorName), ct.contributorName);
    }
    const legacyContributors: CollectionContributor[] = [...legacyNames.entries()].map(
      ([id, displayName]) => ({
        id,
        displayName,
        linkedUserId: null,
        totalContributed: totalsById.get(id) ?? 0,
        isLegacy: true,
      }),
    );

    const contributors = [...realContributors, ...legacyContributors].sort(
      (a, b) => b.totalContributed - a.totalContributed,
    );

    const toParty = (row: { contributorId: string }, amount: number): ExpenseParty => ({
      contributorId: row.contributorId,
      contributorName: nameById.get(row.contributorId) ?? "Unknown",
      amount,
    });

    const expenses: CollectionExpenseRow[] = rawExpenses
      .map((e) => {
        const category = e.categoryId ? categoryMap.get(e.categoryId) : undefined;
        const payers = (payersByExpense.get(e.id) ?? []).map((p) => toParty(p, p.amount));
        const splits = (splitsByExpense.get(e.id) ?? []).map((s) => toParty(s, s.shareAmount));
        return {
          id: e.id,
          amount: e.amount,
          description: e.description,
          categoryId: e.categoryId,
          categoryName: category?.name ?? null,
          categoryIcon: category?.icon ?? null,
          paidByContributorId: e.paidByContributorId,
          paidByName: e.paidByContributorId ? (nameById.get(e.paidByContributorId) ?? null) : null,
          payers,
          splits,
          spentAt: e.spentAt,
          linkedTransactionId: e.linkedTransactionId,
        };
      })
      .sort((a, b) => (a.spentAt < b.spentAt ? 1 : -1));

    const settlements: CollectionSettlementRow[] = (settlementsByCollection.get(c.id) ?? [])
      .map((s) => ({
        id: s.id,
        fromContributorId: s.fromContributorId,
        fromName: nameById.get(s.fromContributorId) ?? "Unknown",
        toContributorId: s.toContributorId,
        toName: nameById.get(s.toContributorId) ?? "Unknown",
        amount: s.amount,
        settledAt: s.settledAt,
        note: s.note,
      }))
      .sort((a, b) => (a.settledAt < b.settledAt ? 1 : -1));

    const type = c.type as CollectionType;
    const balances =
      type === "trip"
        ? computeTripBalances(
            expenses.map((e) => ({ payers: e.payers, splits: e.splits })),
            settlements,
          )
        : [];
    const suggestedSettlements =
      type === "trip"
        ? simplifySettlements(balances).map((s) => ({
            ...s,
            fromName: nameById.get(s.fromContributorId) ?? "Unknown",
            toName: nameById.get(s.toContributorId) ?? "Unknown",
          }))
        : [];

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
      type,
      contributors,
      contributions,
      expenses,
      settlements,
      balances,
      suggestedSettlements,
      summary,
    };
  });

  collections.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return 0;
  });

  return { collections, currency };
}
