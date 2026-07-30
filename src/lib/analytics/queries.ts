import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDisplayCurrency } from "@/lib/profile/queries";
import { computeHealthScore } from "@/lib/finance/health-score";
import { computeGoalProjection } from "@/lib/finance/goals";
import type { CurrencyCode } from "@/lib/format";
import { demoAnalytics } from "./mock";
import {
  CATEGORY_PALETTE,
  type AnalyticsData,
  type CategorySlice,
  type MonthPoint,
} from "./types";

const RANGE_MONTHS = 6;

type IncomeRow = { amount: string | number; received_at: string };
type ExpenseRow = {
  amount: string | number;
  spent_at: string;
  categories: { name: string | null; color: string | null } | null;
};
type ContributionRow = { amount: string | number; contributed_at: string };
type GoalRow = {
  target_amount: string | number;
  current_amount: string | number;
  monthly_contribution: string | number | null;
  deadline: string | null;
};

/** Aggregated analytics over the trailing `RANGE_MONTHS` months. */
export async function getAnalyticsData(): Promise<AnalyticsData> {
  const currency = await getDisplayCurrency();

  if (!isSupabaseConfigured()) return { ...demoAnalytics, currency };

  const supabase = await createClient();
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - (RANGE_MONTHS - 1), 1);
  const fromISO = from.toISOString().slice(0, 10);

  const [
    { data: incomeRows },
    { data: expenseRows },
    { data: loanRows },
    { data: contributionRows },
    { data: goalRows },
    { data: investmentContribRows },
  ] = await Promise.all([
    supabase
      .from("income")
      .select("amount, received_at")
      .is("deleted_at", null)
      .gte("received_at", fromISO),
    supabase
      .from("expenses")
      .select("amount, spent_at, categories(name, color)")
      .is("deleted_at", null)
      .gte("spent_at", fromISO),
    supabase
      .from("loans")
      .select("emi, extra_emi, remaining_amount")
      .is("deleted_at", null),
    // Goal money actually moved this window — counts as savings, not spend.
    supabase
      .from("goal_contributions")
      .select("amount, contributed_at")
      .is("deleted_at", null)
      .gte("contributed_at", fromISO),
    // Active goals drive the real "on track" share for the health score.
    supabase
      .from("goals")
      .select("target_amount, current_amount, monthly_contribution, deadline")
      .is("deleted_at", null)
      .eq("status", "active"),
    // Money actually invested this window drives the investment-rate signal.
    supabase
      .from("investment_contributions")
      .select("amount, contributed_at")
      .is("deleted_at", null)
      .gte("contributed_at", fromISO),
  ]);

  const income = (incomeRows ?? []) as IncomeRow[];
  const expenses = (expenseRows ?? []) as unknown as ExpenseRow[];
  const contributions = (contributionRows ?? []) as ContributionRow[];

  // Build month buckets in order.
  const months = buildMonthBuckets(now);
  const index = new Map(months.map((m, i) => [m.key, i]));

  for (const r of income) {
    const i = index.get(r.received_at.slice(0, 7));
    if (i != null) months[i].income += Number(r.amount);
  }
  for (const r of expenses) {
    const i = index.get(r.spent_at.slice(0, 7));
    if (i != null) months[i].expenses += Number(r.amount);
  }
  for (const r of contributions) {
    const i = index.get(r.contributed_at.slice(0, 7));
    if (i != null) months[i].contributed += Number(r.amount);
  }
  for (const m of months) {
    // Net cash flow stays income − expenses (the net-worth trend depends on it).
    m.net = m.income - m.expenses;
    m.savingsRate = savingsRateOf(m.income, m.net, m.contributed);
  }

  const byCategory = aggregateByCategory(expenses);

  const totals = totalsFrom(months);
  const totalEmi = ((loanRows ?? []) as {
    emi: string | number;
    extra_emi: string | number | null;
    remaining_amount: string | number;
  }[])
    .filter((l) => Number(l.remaining_amount) > 0)
    .reduce((s, l) => s + Number(l.emi) + Number(l.extra_emi ?? 0), 0);

  const goalCompletion = goalCompletionShare((goalRows ?? []) as GoalRow[]);
  const investedThisWindow = (
    (investmentContribRows ?? []) as ContributionRow[]
  ).reduce((s, r) => s + Number(r.amount), 0);
  const investmentRate =
    totals.income > 0 ? investedThisWindow / totals.income : 0;
  const health = deriveHealth(
    months,
    totals,
    totalEmi,
    goalCompletion,
    investmentRate,
  );

  return {
    monthsCount: RANGE_MONTHS,
    months,
    totals,
    byCategory,
    health,
    currency,
  };
}

function buildMonthBuckets(now: Date): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = RANGE_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(d),
      income: 0,
      expenses: 0,
      net: 0,
      contributed: 0,
      savingsRate: 0,
    });
  }
  return out;
}

/**
 * Savings rate as a share of income. Money moved into goals counts as saved
 * even in a month where lumpy expenses push net cash flow low — so the rate is
 * the larger of net cash flow and goal contributions (never their sum, to
 * avoid double-counting money that is already outside expenses).
 */
function savingsRateOf(income: number, net: number, contributed: number): number {
  return income > 0 ? Math.max(net, contributed) / income : 0;
}

function aggregateByCategory(expenses: ExpenseRow[]): CategorySlice[] {
  const map = new Map<string, { amount: number; color: string | null }>();
  for (const r of expenses) {
    const name = r.categories?.name ?? "Uncategorized";
    const entry = map.get(name) ?? { amount: 0, color: r.categories?.color ?? null };
    entry.amount += Number(r.amount);
    map.set(name, entry);
  }
  return [...map.entries()]
    .map(([category, v], i) => ({
      category,
      amount: v.amount,
      color: v.color ?? CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
    }))
    .sort((a, b) => b.amount - a.amount);
}

function totalsFrom(months: MonthPoint[]) {
  const income = months.reduce((s, m) => s + m.income, 0);
  const expenses = months.reduce((s, m) => s + m.expenses, 0);
  const contributed = months.reduce((s, m) => s + m.contributed, 0);
  const net = income - expenses;
  return {
    income,
    expenses,
    net,
    contributed,
    savingsRate: savingsRateOf(income, net, contributed),
    avgMonthlyExpense: expenses / months.length,
  };
}

/**
 * Share of active goals that are on track (0–1), from each goal's projection.
 * A goal counts as on track when its pace meets the deadline, it has no
 * deadline to miss, or it's already complete — i.e. `onTrack !== false`.
 * Falls back to a neutral 0.6 when there are no active goals to judge, so the
 * score isn't dinged for simply not having set any goals yet.
 */
function goalCompletionShare(goals: GoalRow[]): number {
  if (goals.length === 0) return 0.6;
  const onTrack = goals.filter((g) => {
    const { onTrack } = computeGoalProjection({
      targetAmount: Number(g.target_amount),
      currentAmount: Number(g.current_amount),
      monthlyContribution:
        g.monthly_contribution == null ? null : Number(g.monthly_contribution),
      deadline: g.deadline,
    });
    return onTrack !== false;
  }).length;
  return onTrack / goals.length;
}

function deriveHealth(
  months: MonthPoint[],
  totals: ReturnType<typeof totalsFrom>,
  totalEmi: number,
  goalCompletion: number,
  investmentRate: number,
) {
  const incomes = months.map((m) => m.income).filter((v) => v > 0);
  const meanIncome =
    incomes.reduce((s, v) => s + v, 0) / (incomes.length || 1);
  const variance =
    incomes.reduce((s, v) => s + (v - meanIncome) ** 2, 0) /
    (incomes.length || 1);
  const cv = meanIncome > 0 ? Math.sqrt(variance) / meanIncome : 1;
  const incomeStability = Math.max(0, Math.min(1, 1 - cv));

  const debtRatio = meanIncome > 0 ? totalEmi / meanIncome : 0;

  return computeHealthScore({
    savingsRate: totals.savingsRate,
    debtRatio,
    incomeStability,
    investmentRate,
    // Not yet derivable — neutral placeholders until those modules land.
    emergencyFundMonths: 3,
    budgetDiscipline: 0.7,
    goalCompletion,
  });
}

export type { CurrencyCode };
