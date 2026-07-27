import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { CurrencyCode } from "@/lib/format";
import { demoTransactions } from "./mock";
import type {
  Transaction,
  TransactionFilter,
  TransactionSummary,
} from "./types";

// PostgREST embeds the related category/account rows via the FK relationship.
type Embedded = {
  categories: { name: string | null; icon: string | null } | null;
  accounts: { name: string | null } | null;
};

/**
 * Unified transaction feed: reads both `income` and `expenses` (RLS scopes
 * them to the current user), flattens to one `Transaction[]`, newest first.
 * Returns demo data when Supabase isn't configured so the page always renders.
 */
export async function getTransactions(
  filter: TransactionFilter = "all",
): Promise<Transaction[]> {
  if (!isSupabaseConfigured()) {
    return filter === "all"
      ? demoTransactions
      : demoTransactions.filter((t) => t.kind === filter);
  }

  const supabase = await createClient();
  const results: Transaction[] = [];

  if (filter !== "expense") {
    const { data } = await supabase
      .from("income")
      .select(
        "id, amount, currency, description, category_id, account_id, received_at, is_recurring, frequency, source_type, categories(name, icon), accounts(name)",
      )
      .is("deleted_at", null)
      .order("received_at", { ascending: false })
      .limit(200);

    for (const r of (data ?? []) as unknown as (IncomeRow & Embedded)[]) {
      results.push(mapRow("income", r, r.received_at, { sourceType: r.source_type }));
    }
  }

  if (filter !== "income") {
    const { data } = await supabase
      .from("expenses")
      .select(
        "id, amount, currency, description, note, tags, category_id, account_id, spent_at, is_recurring, frequency, categories(name, icon), accounts(name)",
      )
      .is("deleted_at", null)
      .order("spent_at", { ascending: false })
      .limit(200);

    for (const r of (data ?? []) as unknown as (ExpenseRow & Embedded)[]) {
      results.push(mapRow("expense", r, r.spent_at, { note: r.note, tags: r.tags }));
    }
  }

  results.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return results;
}

export function summarize(
  transactions: Transaction[],
  currency: CurrencyCode = "USD",
): TransactionSummary {
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (t.kind === "income") income += t.amount;
    else expenses += t.amount;
  }
  return {
    income,
    expenses,
    net: income - expenses,
    currency,
    count: transactions.length,
  };
}

interface BaseRow {
  id: string;
  amount: string | number;
  currency: string;
  description: string | null;
  category_id: string | null;
  account_id: string | null;
  is_recurring: boolean;
  frequency: string;
}
type IncomeRow = BaseRow & { received_at: string; source_type: string | null };
type ExpenseRow = BaseRow & {
  spent_at: string;
  note: string | null;
  tags: string[] | null;
};

function mapRow(
  kind: Transaction["kind"],
  r: BaseRow & Embedded,
  date: string,
  extra: Partial<Transaction>,
): Transaction {
  return {
    id: r.id,
    kind,
    amount: Number(r.amount),
    currency: (r.currency as CurrencyCode) ?? "USD",
    description: r.description,
    categoryId: r.category_id,
    categoryName: r.categories?.name ?? null,
    categoryIcon: r.categories?.icon ?? null,
    accountId: r.account_id,
    accountName: r.accounts?.name ?? null,
    date,
    isRecurring: r.is_recurring,
    frequency: r.frequency,
    ...extra,
  };
}
