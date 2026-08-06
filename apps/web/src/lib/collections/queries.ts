import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Packed-ciphertext rows straight off `collections`/`collection_contributions`
 * — `targetAmount`/`payoutAmount`/contributor `amount`/`contributorName` need
 * the vault DEK to read, so no totals are computed here. See
 * src/lib/collections/compute.ts, which takes over once the client has
 * decrypted these via src/lib/finance/decrypt.ts's
 * `decryptCollectionRows`/`decryptCollectionContributionRows`.
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
  payoutAmount: string | null;
  payoutAt: string | null;
  payoutNote: string | null;
  payoutExpenseId: string | null;
}

export interface RawCollectionContributionRow {
  id: string;
  collectionId: string;
  contributorName: string;
  amount: string;
  contributedAt: string;
  method: string | null;
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
  payout_amount: string | null;
  payout_at: string | null;
  payout_note: string | null;
  payout_expense_id: string | null;
}

interface ContributionSel {
  id: string;
  collection_id: string;
  contributor_name: string;
  amount: string;
  contributed_at: string;
  method: string | null;
  note: string | null;
}

export async function fetchCollectionsRaw(): Promise<RawCollectionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collections")
    .select(
      "id, title, purpose, icon, target_amount, currency, event_date, status, payout_amount, payout_at, payout_note, payout_expense_id",
    )
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
    payoutAmount: c.payout_amount,
    payoutAt: c.payout_at,
    payoutNote: c.payout_note,
    payoutExpenseId: c.payout_expense_id,
  }));
}

export async function fetchCollectionContributionsRaw(): Promise<
  RawCollectionContributionRow[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collection_contributions")
    .select("id, collection_id, contributor_name, amount, contributed_at, method, note")
    .is("deleted_at", null)
    .order("contributed_at", { ascending: false });

  return ((data ?? []) as ContributionSel[]).map((c) => ({
    id: c.id,
    collectionId: c.collection_id,
    contributorName: c.contributor_name,
    amount: c.amount,
    contributedAt: c.contributed_at,
    method: c.method,
    note: c.note,
  }));
}
