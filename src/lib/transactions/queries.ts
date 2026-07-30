import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CurrencyCode } from "@/lib/format";
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
 */
export async function getTransactions(
  filter: TransactionFilter = "all",
): Promise<Transaction[]> {
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

  // Savings-goal contributions surface as read-only "transfer" rows. They're
  // neither income nor spend, so they only appear in the unified "all" feed.
  if (filter === "all") {
    const { data } = await supabase
      .from("goal_contributions")
      .select("id, amount, contributed_at, note, goals(name, icon, deleted_at)")
      .is("deleted_at", null)
      .order("contributed_at", { ascending: false })
      .limit(200);

    for (const r of (data ?? []) as unknown as ContributionRow[]) {
      // Skip contributions whose goal was deleted.
      if (!r.goals || r.goals.deleted_at) continue;
      results.push(mapContribution(r));
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
    else if (t.kind === "expense") expenses += t.amount;
    // transfers are savings movements — excluded from income/expense/net.
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
type ContributionRow = {
  id: string;
  amount: string | number;
  contributed_at: string;
  note: string | null;
  goals: { name: string | null; icon: string | null; deleted_at: string | null } | null;
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

/** A goal contribution as a read-only "transfer" transaction. */
function mapContribution(r: ContributionRow): Transaction {
  const goalName = r.goals?.name ?? "a goal";
  return {
    // Prefix keeps it distinct from expense/income ids; it isn't editable here.
    id: `contrib-${r.id}`,
    kind: "transfer",
    amount: Number(r.amount),
    // Formatted with the display currency at the view layer, like every row.
    currency: "USD",
    description: `Moved to ${goalName}`,
    categoryId: null,
    categoryName: "Savings",
    categoryIcon: r.goals?.icon ?? "piggy-bank",
    accountId: null,
    accountName: null,
    date: r.contributed_at,
    isRecurring: false,
    frequency: "one_time",
    note: r.note,
  };
}
