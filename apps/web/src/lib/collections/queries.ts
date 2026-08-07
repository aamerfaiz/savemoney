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
  type: string;
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

export interface RawCollectionExpensePayerRow {
  id: string;
  expenseId: string;
  contributorId: string;
  amount: string;
}

export interface RawCollectionExpenseSplitRow {
  id: string;
  expenseId: string;
  contributorId: string;
  shareAmount: string;
}

export interface RawCollectionSettlementRow {
  id: string;
  collectionId: string;
  fromContributorId: string;
  toContributorId: string;
  amount: string;
  settledAt: string;
  note: string | null;
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
  type: string;
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

interface ExpensePayerSel {
  id: string;
  expense_id: string;
  contributor_id: string;
  amount: string;
}

interface ExpenseSplitSel {
  id: string;
  expense_id: string;
  contributor_id: string;
  share_amount: string;
}

interface SettlementSel {
  id: string;
  collection_id: string;
  from_contributor_id: string;
  to_contributor_id: string;
  amount: string;
  settled_at: string;
  note: string | null;
}

export async function fetchCollectionsRaw(): Promise<RawCollectionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collections")
    .select("id, title, purpose, icon, target_amount, currency, event_date, status, type")
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
    type: c.type,
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

/** `trip`-type only. Fetched unfiltered by which expense it belongs to —
 * `compute.ts` joins these onto `collection_expenses` in memory, the same
 * way it joins categories, so a payer/split row for an expense that's since
 * been soft-deleted simply has no expense to attach to and is dropped. */
export async function fetchCollectionExpensePayersRaw(): Promise<RawCollectionExpensePayerRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collection_expense_payers")
    .select("id, expense_id, contributor_id, amount");

  return ((data ?? []) as ExpensePayerSel[]).map((p) => ({
    id: p.id,
    expenseId: p.expense_id,
    contributorId: p.contributor_id,
    amount: p.amount,
  }));
}

export async function fetchCollectionExpenseSplitsRaw(): Promise<RawCollectionExpenseSplitRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collection_expense_splits")
    .select("id, expense_id, contributor_id, share_amount");

  return ((data ?? []) as ExpenseSplitSel[]).map((s) => ({
    id: s.id,
    expenseId: s.expense_id,
    contributorId: s.contributor_id,
    shareAmount: s.share_amount,
  }));
}

export async function fetchCollectionSettlementsRaw(): Promise<RawCollectionSettlementRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collection_settlements")
    .select("id, collection_id, from_contributor_id, to_contributor_id, amount, settled_at, note")
    .is("deleted_at", null)
    .order("settled_at", { ascending: false });

  return ((data ?? []) as SettlementSel[]).map((s) => ({
    id: s.id,
    collectionId: s.collection_id,
    fromContributorId: s.from_contributor_id,
    toContributorId: s.to_contributor_id,
    amount: s.amount,
    settledAt: s.settled_at,
    note: s.note,
  }));
}
