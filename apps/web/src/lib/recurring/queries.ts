import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { RecurringKind } from "./types";

/**
 * Packed-ciphertext row straight off the `recurring_rules` table (Phase
 * 3.5.4, see docs/e2ee-path-b-plan.md) — `amount` needs the vault DEK to
 * read, so no computation (`nextOccurrence`/`monthlyAmount`/totals) happens
 * here anymore. See src/lib/recurring/compute.ts, which takes over once
 * the client has decrypted these via src/lib/finance/decrypt.ts's
 * `decryptRecurringRows`.
 */
export interface RawRecurringRow {
  id: string;
  name: string;
  kind: RecurringKind;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  accountId: string | null;
  amount: string;
  currency: string;
  frequency: string;
  interval: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  note: string | null;
}

interface RecurringSel {
  id: string;
  name: string;
  kind: string;
  category_id: string | null;
  account_id: string | null;
  amount: string;
  currency: string;
  frequency: string;
  interval: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  note: string | null;
  categories: { name: string | null; icon: string | null } | null;
}

export async function fetchRecurringRulesRaw(): Promise<RawRecurringRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_rules")
    .select(
      "id, name, kind, category_id, account_id, amount, currency, frequency, interval, start_date, end_date, is_active, note, categories(name, icon)",
    )
    .is("deleted_at", null);

  return ((data ?? []) as unknown as RecurringSel[]).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as RecurringKind,
    categoryId: r.category_id,
    categoryName: r.categories?.name ?? null,
    categoryIcon: r.categories?.icon ?? null,
    accountId: r.account_id,
    amount: r.amount,
    currency: r.currency,
    frequency: r.frequency,
    interval: r.interval ?? 1,
    startDate: r.start_date,
    endDate: r.end_date,
    isActive: r.is_active,
    note: r.note,
  }));
}
