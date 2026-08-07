import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Packed-ciphertext rows straight off `collections`/`collection_contributors`/
 * `collection_contributions`/`collection_expenses` — every amount and name
 * needs the vault DEK to read, so no totals are computed here. See
 * src/lib/collections/compute.ts, which takes over once the client has
 * decrypted these via src/lib/finance/decrypt.ts's `decryptCollection*`
 * functions.
 */
export interface RawCollectionRow {
  id: string;
  title: string;
  purpose: string | null;
  icon: string | null;
  targetAmount: string | null;
  currency: string;
  eventDate: string | null;
  status: string;
}

export interface RawCollectionContributorRow {
  id: string;
  collectionId: string;
  displayName: string;
  linkedUserId: string | null;
}

export interface RawCollectionContributionRow {
  id: string;
  collectionId: string;
  contributorId: string | null;
  contributorName: string | null;
  amount: string;
  contributedAt: string;
  method: string | null;
  note: string | null;
}

export interface RawCollectionExpenseRow {
  id: string;
  collectionId: string;
  amount: string;
  description: string | null;
  categoryId: string | null;
  paidByContributorId: string | null;
  spentAt: string;
  linkedTransactionId: string | null;
}

interface CollectionSel {
  id: string;
  title: string;
  purpose: string | null;
  icon: string | null;
  target_amount: string | null;
  currency: string;
  event_date: string | null;
  status: string;
}

interface ContributorSel {
  id: string;
  collection_id: string;
  display_name: string;
  linked_user_id: string | null;
}

interface ContributionSel {
  id: string;
  collection_id: string;
  contributor_id: string | null;
  contributor_name: string | null;
  amount: string;
  contributed_at: string;
  method: string | null;
  note: string | null;
}

interface ExpenseSel {
  id: string;
  collection_id: string;
  amount: string;
  description: string | null;
  category_id: string | null;
  paid_by_contributor_id: string | null;
  spent_at: string;
  linked_transaction_id: string | null;
}

export async function fetchCollectionsRaw(): Promise<RawCollectionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collections")
    .select("id, title, purpose, icon, target_amount, currency, event_date, status")
    .is("deleted_at", null);

  return ((data ?? []) as CollectionSel[]).map((c) => ({
    id: c.id,
    title: c.title,
    purpose: c.purpose,
    icon: c.icon,
    targetAmount: c.target_amount,
    currency: c.currency,
    eventDate: c.event_date,
    status: c.status,
  }));
}

export async function fetchCollectionContributorsRaw(): Promise<RawCollectionContributorRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collection_contributors")
    .select("id, collection_id, display_name, linked_user_id")
    .is("deleted_at", null);

  return ((data ?? []) as ContributorSel[]).map((p) => ({
    id: p.id,
    collectionId: p.collection_id,
    displayName: p.display_name,
    linkedUserId: p.linked_user_id,
  }));
}

export async function fetchCollectionContributionsRaw(): Promise<
  RawCollectionContributionRow[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collection_contributions")
    .select(
      "id, collection_id, contributor_id, contributor_name, amount, contributed_at, method, note",
    )
    .is("deleted_at", null)
    .order("contributed_at", { ascending: false });

  return ((data ?? []) as ContributionSel[]).map((c) => ({
    id: c.id,
    collectionId: c.collection_id,
    contributorId: c.contributor_id,
    contributorName: c.contributor_name,
    amount: c.amount,
    contributedAt: c.contributed_at,
    method: c.method,
    note: c.note,
  }));
}

export async function fetchCollectionExpensesRaw(): Promise<RawCollectionExpenseRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collection_expenses")
    .select(
      "id, collection_id, amount, description, category_id, paid_by_contributor_id, spent_at, linked_transaction_id",
    )
    .is("deleted_at", null)
    .order("spent_at", { ascending: false });

  return ((data ?? []) as ExpenseSel[]).map((e) => ({
    id: e.id,
    collectionId: e.collection_id,
    amount: e.amount,
    description: e.description,
    categoryId: e.category_id,
    paidByContributorId: e.paid_by_contributor_id,
    spentAt: e.spent_at,
    linkedTransactionId: e.linked_transaction_id,
  }));
}
