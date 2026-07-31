import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface NamedOption {
  id: string;
  name: string;
  /** A representative recurring amount (monthly SIP, EMI, monthly goal
   * contribution) used only for the soft anomaly check — never for
   * validation. */
  typicalAmount?: number;
}

export interface TransactionOption extends NamedOption {
  kind: "income" | "expense";
  date: string;
}

export interface ReferenceData {
  expenseCategories: NamedOption[];
  incomeCategories: NamedOption[];
  accounts: NamedOption[];
  investments: NamedOption[];
  loans: NamedOption[];
  goals: NamedOption[];
  recurringRules: NamedOption[];
  /** Synthetic "label" per row (no real name column on budgets) — see
   * `budgetLabel()`. */
  budgets: NamedOption[];
  /** Recent transactions only (capped) — a name-less row is matched against
   * a synthesized label of description/category/amount/date. Editing or
   * deleting something older than this window isn't resolvable yet; the
   * capability surfaces that as a clear error rather than guessing. */
  transactions: TransactionOption[];
}

const RECENT_TRANSACTIONS_LIMIT = 30;

/**
 * Every reference set a capability might need to resolve a name against,
 * loaded once per request. Every query goes through the RLS-scoped Supabase
 * client, so this can only ever return the signed-in user's own rows —
 * there is no path here for one user's prompt to resolve against another
 * user's data.
 */
export async function loadReferenceData(): Promise<ReferenceData> {
  const supabase = await createClient();

  const [
    { data: categories },
    { data: accounts },
    { data: investments },
    { data: loans },
    { data: goals },
    { data: recurring },
    { data: budgets },
    { data: expenses },
    { data: income },
  ] = await Promise.all([
    supabase.from("categories").select("id, name, kind").is("deleted_at", null),
    supabase
      .from("accounts")
      .select("id, name")
      .is("deleted_at", null)
      .eq("is_active", true),
    supabase
      .from("investments")
      .select("id, name, monthly_contribution")
      .is("deleted_at", null),
    supabase.from("loans").select("id, name, emi").is("deleted_at", null),
    supabase
      .from("goals")
      .select("id, name, monthly_contribution")
      .is("deleted_at", null),
    supabase
      .from("recurring_rules")
      .select("id, name")
      .is("deleted_at", null),
    supabase
      .from("budgets")
      .select("id, category_id, period")
      .is("deleted_at", null),
    supabase
      .from("expenses")
      .select("id, amount, spent_at, description, category_id")
      .is("deleted_at", null)
      .order("spent_at", { ascending: false })
      .limit(RECENT_TRANSACTIONS_LIMIT),
    supabase
      .from("income")
      .select("id, amount, received_at, description, category_id")
      .is("deleted_at", null)
      .order("received_at", { ascending: false })
      .limit(RECENT_TRANSACTIONS_LIMIT),
  ]);

  const cats = (categories ?? []) as { id: string; name: string; kind: string }[];
  const categoryName = (id: string | null) => cats.find((c) => c.id === id)?.name ?? null;

  const expenseRows = (
    (expenses ?? []) as {
      id: string;
      amount: string | number;
      spent_at: string;
      description: string | null;
      category_id: string | null;
    }[]
  ).map((e) => transactionOption(e.id, "expense", e.amount, e.spent_at, e.description, categoryName(e.category_id)));
  const incomeRows = (
    (income ?? []) as {
      id: string;
      amount: string | number;
      received_at: string;
      description: string | null;
      category_id: string | null;
    }[]
  ).map((i) => transactionOption(i.id, "income", i.amount, i.received_at, i.description, categoryName(i.category_id)));

  const transactions = [...expenseRows, ...incomeRows]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, RECENT_TRANSACTIONS_LIMIT);

  return {
    expenseCategories: cats
      .filter((c) => c.kind === "expense")
      .map((c) => ({ id: c.id, name: c.name })),
    incomeCategories: cats
      .filter((c) => c.kind === "income")
      .map((c) => ({ id: c.id, name: c.name })),
    accounts: ((accounts ?? []) as { id: string; name: string }[]).map((a) => ({
      id: a.id,
      name: a.name,
    })),
    investments: (
      (investments ?? []) as {
        id: string;
        name: string;
        monthly_contribution: string | number | null;
      }[]
    ).map((i) => ({
      id: i.id,
      name: i.name,
      typicalAmount:
        i.monthly_contribution == null ? undefined : Number(i.monthly_contribution),
    })),
    loans: (
      (loans ?? []) as { id: string; name: string; emi: string | number }[]
    ).map((l) => ({ id: l.id, name: l.name, typicalAmount: Number(l.emi) })),
    goals: (
      (goals ?? []) as {
        id: string;
        name: string;
        monthly_contribution: string | number | null;
      }[]
    ).map((g) => ({
      id: g.id,
      name: g.name,
      typicalAmount:
        g.monthly_contribution == null ? undefined : Number(g.monthly_contribution),
    })),
    recurringRules: ((recurring ?? []) as { id: string; name: string }[]).map((r) => ({
      id: r.id,
      name: r.name,
    })),
    budgets: (
      (budgets ?? []) as { id: string; category_id: string | null; period: string }[]
    ).map((b) => ({
      id: b.id,
      name: `${categoryName(b.category_id) ?? "Overall"} budget (${b.period})`,
    })),
    transactions,
  };
}

function transactionOption(
  id: string,
  kind: "income" | "expense",
  amount: string | number,
  date: string,
  description: string | null,
  category: string | null,
): TransactionOption {
  const what = description || category || (kind === "income" ? "Income" : "Expense");
  return { id, kind, date, name: `${what} · ${Number(amount)} · ${date}` };
}

/**
 * The current, editable field values for one row — fetched only when a
 * capability's `resolve()` needs to merge a user's requested changes on top
 * of what's already there (edit capabilities never wipe fields the user
 * didn't mention). RLS scopes every read to the caller.
 */
export async function fetchCurrentInvestment(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("investments")
    .select("name, type, invested_amount, current_value, monthly_contribution, expected_return, start_date")
    .eq("id", id)
    .single();
  if (!data) return null;
  return {
    name: data.name as string,
    type: data.type as string,
    investedAmount: Number(data.invested_amount),
    currentValue: Number(data.current_value),
    monthlyContribution: data.monthly_contribution == null ? null : Number(data.monthly_contribution),
    expectedReturn: Number(data.expected_return),
    startDate: data.start_date as string,
  };
}

export async function fetchCurrentLoan(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("loans")
    .select("name, type, principal, interest_rate, emi, remaining_amount, remaining_months, extra_emi, start_date")
    .eq("id", id)
    .single();
  if (!data) return null;
  return {
    name: data.name as string,
    type: data.type as string,
    principal: Number(data.principal),
    interestRate: Number(data.interest_rate),
    emi: Number(data.emi),
    remainingAmount: Number(data.remaining_amount),
    remainingMonths: data.remaining_months as number | null,
    extraEmi: data.extra_emi == null ? null : Number(data.extra_emi),
    startDate: data.start_date as string,
  };
}

export async function fetchCurrentGoal(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("goals")
    .select("name, icon, target_amount, current_amount, deadline, priority, monthly_contribution")
    .eq("id", id)
    .single();
  if (!data) return null;
  return {
    name: data.name as string,
    icon: data.icon as string | null,
    targetAmount: Number(data.target_amount),
    currentAmount: Number(data.current_amount),
    deadline: data.deadline as string | null,
    priority: data.priority as string,
    monthlyContribution: data.monthly_contribution == null ? null : Number(data.monthly_contribution),
  };
}

export async function fetchCurrentBudget(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("budgets")
    .select("category_id, period, amount, starts_on")
    .eq("id", id)
    .single();
  if (!data) return null;
  return {
    categoryId: data.category_id as string | null,
    period: data.period as string,
    amount: Number(data.amount),
    startsOn: data.starts_on as string,
  };
}

export async function fetchCurrentRecurring(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_rules")
    .select("name, kind, category_id, account_id, amount, frequency, interval, start_date, end_date, is_active, note")
    .eq("id", id)
    .single();
  if (!data) return null;
  return {
    name: data.name as string,
    kind: data.kind as string,
    categoryId: data.category_id as string | null,
    accountId: data.account_id as string | null,
    amount: Number(data.amount),
    frequency: data.frequency as string,
    interval: data.interval as number,
    startDate: data.start_date as string,
    endDate: data.end_date as string | null,
    isActive: data.is_active as boolean,
    note: data.note as string | null,
  };
}

export async function fetchCurrentTransaction(id: string, kind: "income" | "expense") {
  const supabase = await createClient();
  if (kind === "expense") {
    const { data } = await supabase
      .from("expenses")
      .select("amount, spent_at, category_id, account_id, description, note")
      .eq("id", id)
      .single();
    if (!data) return null;
    return {
      kind: "expense" as const,
      amount: Number(data.amount),
      date: data.spent_at as string,
      categoryId: data.category_id as string | null,
      accountId: data.account_id as string | null,
      description: data.description as string | null,
      note: data.note as string | null,
    };
  }
  const { data } = await supabase
    .from("income")
    .select("amount, received_at, category_id, account_id, description, source_type")
    .eq("id", id)
    .single();
  if (!data) return null;
  return {
    kind: "income" as const,
    amount: Number(data.amount),
    date: data.received_at as string,
    categoryId: data.category_id as string | null,
    accountId: data.account_id as string | null,
    description: data.description as string | null,
    sourceType: data.source_type as string,
  };
}

/**
 * Case-insensitive match against the user's own reference rows. Exact match
 * first, then a loose substring match. Returns `null` (never invents or
 * guesses an id) when nothing matches — the caller is responsible for
 * surfacing that as an "unresolved" warning rather than silently picking
 * something.
 */
export function matchByName<T extends NamedOption>(guess: string | null, options: T[]): T | null {
  if (!guess) return null;
  const norm = guess.trim().toLowerCase();
  if (!norm) return null;

  const exact = options.find((o) => o.name.toLowerCase() === norm);
  if (exact) return exact;

  const partial = options.find(
    (o) =>
      o.name.toLowerCase().includes(norm) || norm.includes(o.name.toLowerCase()),
  );
  return partial ?? null;
}

/**
 * Bridges a validated, plain object into the `FormData` shape every
 * module's existing Server Action already expects — this is what lets Smart
 * Entry reuse those actions verbatim as the single write path instead of a
 * second, parallel insert path.
 */
export function toFormData(fields: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    fd.set(key, typeof value === "boolean" ? String(value) : String(value));
  }
  return fd;
}
