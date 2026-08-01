"use server";

/**
 * The single fetch boundary for encrypted finance data (Phase 3.5.3 — see
 * docs/e2ee-path-b-plan.md). Reads through the Supabase client exactly as
 * before (RLS still scopes rows to the caller) — the only change is that
 * `amount`/`description`/`note`/`tags` now arrive as packed ciphertext
 * strings instead of usable values. Every page that needs decrypted
 * finance data goes through this one Server Action + src/lib/finance/
 * decrypt.ts, rather than each re-implementing its own fetch.
 */

import { createClient } from "@/lib/supabase/server";

export interface RawIncomeRow {
  id: string;
  amount: string;
  currency: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  accountId: string | null;
  accountName: string | null;
  receivedAt: string;
  isRecurring: boolean;
  frequency: string;
  sourceType: string | null;
}

export interface RawExpenseRow {
  id: string;
  amount: string;
  currency: string;
  description: string | null;
  note: string | null;
  tags: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountId: string | null;
  accountName: string | null;
  spentAt: string;
  isRecurring: boolean;
  frequency: string;
}

export interface RawContributionRow {
  /** `goal_contributions.amount` isn't in Phase 3.5.3's scope — still plain. */
  id: string;
  amount: number;
  contributedAt: string;
  note: string | null;
  goalName: string | null;
  goalIcon: string | null;
  goalDeletedAt: string | null;
}

export interface RawBudgetRow {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  period: string;
  /** Packed ciphertext (Phase 3.5.4) — decrypt via decryptBudgetRows(). */
  amount: string;
  currency: string;
}

/** Active-goals row for the safe-to-spend/health-score path — a narrower,
 * parallel fetch from the same `goals` table as src/lib/goals/queries.ts's
 * `fetchGoalsRaw()` (full list, for the Goals page). Packed ciphertext
 * (Phase 3.5.4) — decrypt via decryptActiveGoals() in finance/decrypt.ts. */
export interface RawActiveGoalRow {
  targetAmount: string;
  currentAmount: string;
  monthlyContribution: string | null;
  deadline: string | null;
}

/** Just the loan fields the safe-to-spend/health-score path needs — a
 * narrower, parallel fetch from the same `loans` table as
 * src/lib/loans/queries.ts's `fetchLoansRaw()` (full list, for the Loans
 * page). Packed ciphertext (Phase 3.5.4) — decrypt via decryptLoanAmounts()
 * in finance/decrypt.ts. */
export interface RawLoanAmountRow {
  emi: string;
  extraEmi: string | null;
  remainingAmount: string;
}

/** None of the rest of this is encrypted this pass — bundled in alongside
 * the ciphertext rows purely because computeBudgetsData/computeAnalyticsData
 * must now run client-side, so everything they need has to be fetchable
 * from there, secret or not. */
export interface FinanceRawData {
  income: RawIncomeRow[];
  expenses: RawExpenseRow[];
  contributions: RawContributionRow[];
  budgets: RawBudgetRow[];
  /** Active goals only — feeds both the safe-to-spend monthly-contribution
   * sum and the health score's on-track share. */
  activeGoals: RawActiveGoalRow[];
  loans: RawLoanAmountRow[];
  /** Packed ciphertext (Phase 3.5.4), null for holdings with no SIP —
   * decrypt via decryptInvestmentMonthlyContributions() in
   * finance/decrypt.ts. */
  investmentMonthlyContributions: (string | null)[];
  investmentContributions: { amount: number; contributedAt: string }[];
}

// Covers analytics' trailing-6-month window and budgets' "since Jan 1"
// worst case (a January budget check needs last December's data at most a
// year back) with margin, plus enough history for the Transactions list.
const WINDOW_MONTHS_BACK = 13;

type IncomeSel = {
  id: string;
  amount: string | number;
  currency: string;
  description: string | null;
  category_id: string | null;
  account_id: string | null;
  received_at: string;
  is_recurring: boolean;
  frequency: string;
  source_type: string | null;
  categories: { name: string | null; icon: string | null } | null;
  accounts: { name: string | null } | null;
};

type ExpenseSel = {
  id: string;
  amount: string | number;
  currency: string;
  description: string | null;
  note: string | null;
  tags: string | null;
  category_id: string | null;
  account_id: string | null;
  spent_at: string;
  is_recurring: boolean;
  frequency: string;
  categories: { name: string | null; icon: string | null; color: string | null } | null;
  accounts: { name: string | null } | null;
};

type ContributionSel = {
  id: string;
  amount: string | number;
  contributed_at: string;
  note: string | null;
  goals: { name: string | null; icon: string | null; deleted_at: string | null } | null;
};

export async function fetchFinanceRawData(): Promise<FinanceRawData | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - WINDOW_MONTHS_BACK, 1);
  const fromISO = from.toISOString().slice(0, 10);

  const [
    { data: incomeRows },
    { data: expenseRows },
    { data: contribRows },
    { data: budgetRows },
    { data: goalRows },
    { data: loanRows },
    { data: investmentRows },
    { data: investmentContribRows },
  ] = await Promise.all([
    supabase
      .from("income")
      .select(
        "id, amount, currency, description, category_id, account_id, received_at, is_recurring, frequency, source_type, categories(name, icon), accounts(name)",
      )
      .is("deleted_at", null)
      .gte("received_at", fromISO)
      .order("received_at", { ascending: false })
      .limit(500),
    supabase
      .from("expenses")
      .select(
        "id, amount, currency, description, note, tags, category_id, account_id, spent_at, is_recurring, frequency, categories(name, icon, color), accounts(name)",
      )
      .is("deleted_at", null)
      .gte("spent_at", fromISO)
      .order("spent_at", { ascending: false })
      .limit(500),
    supabase
      .from("goal_contributions")
      .select("id, amount, contributed_at, note, goals(name, icon, deleted_at)")
      .is("deleted_at", null)
      .order("contributed_at", { ascending: false })
      .limit(200),
    supabase
      .from("budgets")
      .select("id, category_id, period, amount, currency, categories(name, icon)")
      .is("deleted_at", null),
    supabase
      .from("goals")
      .select("target_amount, current_amount, monthly_contribution, deadline")
      .is("deleted_at", null)
      .eq("status", "active"),
    supabase.from("loans").select("emi, extra_emi, remaining_amount").is("deleted_at", null),
    supabase.from("investments").select("monthly_contribution").is("deleted_at", null),
    supabase
      .from("investment_contributions")
      .select("amount, contributed_at")
      .is("deleted_at", null)
      .gte("contributed_at", fromISO),
  ]);

  const income: RawIncomeRow[] = ((incomeRows ?? []) as unknown as IncomeSel[]).map((r) => ({
    id: r.id,
    amount: String(r.amount),
    currency: r.currency,
    description: r.description,
    categoryId: r.category_id,
    categoryName: r.categories?.name ?? null,
    categoryIcon: r.categories?.icon ?? null,
    accountId: r.account_id,
    accountName: r.accounts?.name ?? null,
    receivedAt: r.received_at,
    isRecurring: r.is_recurring,
    frequency: r.frequency,
    sourceType: r.source_type,
  }));

  const expenses: RawExpenseRow[] = ((expenseRows ?? []) as unknown as ExpenseSel[]).map((r) => ({
    id: r.id,
    amount: String(r.amount),
    currency: r.currency,
    description: r.description,
    note: r.note,
    tags: r.tags,
    categoryId: r.category_id,
    categoryName: r.categories?.name ?? null,
    categoryIcon: r.categories?.icon ?? null,
    categoryColor: r.categories?.color ?? null,
    accountId: r.account_id,
    accountName: r.accounts?.name ?? null,
    spentAt: r.spent_at,
    isRecurring: r.is_recurring,
    frequency: r.frequency,
  }));

  const contributions: RawContributionRow[] = ((contribRows ?? []) as unknown as ContributionSel[])
    .filter((r) => r.goals && !r.goals.deleted_at)
    .map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      contributedAt: r.contributed_at,
      note: r.note,
      goalName: r.goals?.name ?? null,
      goalIcon: r.goals?.icon ?? null,
      goalDeletedAt: r.goals?.deleted_at ?? null,
    }));

  const budgets: RawBudgetRow[] = (
    (budgetRows ?? []) as unknown as {
      id: string;
      category_id: string | null;
      period: string;
      amount: string;
      currency: string;
      categories: { name: string | null; icon: string | null } | null;
    }[]
  ).map((b) => ({
    id: b.id,
    categoryId: b.category_id,
    categoryName: b.categories?.name ?? null,
    categoryIcon: b.categories?.icon ?? null,
    period: b.period,
    amount: b.amount,
    currency: b.currency,
  }));

  const activeGoals: RawActiveGoalRow[] = (
    (goalRows ?? []) as {
      target_amount: string;
      current_amount: string;
      monthly_contribution: string | null;
      deadline: string | null;
    }[]
  ).map((g) => ({
    targetAmount: g.target_amount,
    currentAmount: g.current_amount,
    monthlyContribution: g.monthly_contribution,
    deadline: g.deadline,
  }));

  const loans: RawLoanAmountRow[] = (
    (loanRows ?? []) as {
      emi: string;
      extra_emi: string | null;
      remaining_amount: string;
    }[]
  ).map((l) => ({
    emi: l.emi,
    extraEmi: l.extra_emi,
    remainingAmount: l.remaining_amount,
  }));

  const investmentMonthlyContributions = (
    (investmentRows ?? []) as { monthly_contribution: string | null }[]
  ).map((i) => i.monthly_contribution);

  const investmentContributions = (
    (investmentContribRows ?? []) as { amount: string | number; contributed_at: string }[]
  ).map((r) => ({ amount: Number(r.amount), contributedAt: r.contributed_at }));

  return {
    income,
    expenses,
    contributions,
    budgets,
    activeGoals,
    loans,
    investmentMonthlyContributions,
    investmentContributions,
  };
}
