import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getProfile } from "@/lib/profile/queries";
import { getAnalyticsData } from "@/lib/analytics/queries";
import { getBudgetsData } from "@/lib/budgets/queries";
import { getGoalsData } from "@/lib/goals/queries";
import { getLoansData } from "@/lib/loans/queries";
import { getTransactions } from "@/lib/transactions/queries";
import {
  mockDashboard,
  type DashboardData,
  type GoalSummary,
  type Transaction as DashTxn,
  type UpcomingItem,
} from "@/data/mock-dashboard";

/**
 * The dashboard snapshot. Composed entirely from the real module queries when
 * Supabase is configured; the mock is only used in demo mode so the UI still
 * renders without credentials.
 */
export async function getDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) return mockDashboard;

  const [profile, analytics, budgets, goalsData, loansData, txns] =
    await Promise.all([
      getProfile(),
      getAnalyticsData(),
      getBudgetsData(),
      getGoalsData(),
      getLoansData(),
      getTransactions("all"),
    ]);

  const currency = profile.baseCurrency;
  const months = analytics.months;
  const thisMonth = months[months.length - 1] ?? { income: 0, expenses: 0, net: 0 };

  // Best-effort net worth until the Phase-2 assets/liabilities module exists:
  // money set aside for goals minus outstanding debt.
  const netWorth = goalsData.totalSaved - loansData.totalRemaining;

  // Reconstruct a 6-month net-worth trajectory from real monthly net cash flow,
  // anchored so the final point equals the current net worth.
  const netWorthTrend: { month: string; value: number }[] = [];
  let running = netWorth;
  for (let i = months.length - 1; i >= 0; i--) {
    netWorthTrend.unshift({ month: months[i].label, value: Math.round(running) });
    running -= months[i].net;
  }
  const change =
    netWorthTrend.length >= 2
      ? netWorthTrend[netWorthTrend.length - 1].value -
        netWorthTrend[netWorthTrend.length - 2].value
      : 0;
  const prevVal = netWorthTrend.at(-2)?.value ?? 0;
  const netWorthChangePct = prevVal !== 0 ? change / Math.abs(prevVal) : 0;

  const entertainment = budgets.budgets.find(
    (b) => b.categoryName?.toLowerCase() === "entertainment",
  );

  const goals: GoalSummary[] = goalsData.goals
    .filter((g) => g.status === "active")
    .slice(0, 3)
    .map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon ?? "target",
      saved: g.currentAmount,
      target: g.targetAmount,
    }));

  const upcoming: UpcomingItem[] = loansData.loans
    .filter((l) => l.remainingAmount > 0)
    .slice(0, 4)
    .map((l) => ({
      id: l.id,
      title: `${l.name} EMI`,
      amount: l.emi,
      dueDate: nextDueDate(l.startDate),
      kind: "emi" as const,
    }));

  const recent: DashTxn[] = txns.slice(0, 6).map((t) => ({
    id: t.id,
    title: t.description || t.categoryName || (t.kind === "income" ? "Income" : "Expense"),
    category: t.categoryName ?? "Uncategorized",
    amount: t.kind === "income" ? t.amount : -t.amount,
    date: t.date,
    icon: t.categoryIcon ?? "shapes",
  }));

  return {
    currency,
    userName: profile.name,
    monthlyIncome: thisMonth.income,
    monthlyExpenses: thisMonth.expenses,
    savings: thisMonth.net,
    investments: 0,
    netWorth,
    netWorthChangePct,
    cashFlow: thisMonth.net,
    budget: budgets.safeToSpend,
    health: analytics.health,
    entertainmentBudget: entertainment
      ? { spent: entertainment.spent, limit: entertainment.amount }
      : { spent: 0, limit: 0 },
    goals,
    upcoming,
    recent,
    netWorthTrend,
    spendingByCategory: analytics.byCategory.slice(0, 6),
  };
}

/** Next occurrence of the loan's start day-of-month, from today. */
function nextDueDate(startDate: string): string {
  const day = new Date(startDate + "T00:00:00").getDate();
  const now = new Date();
  let due = new Date(now.getFullYear(), now.getMonth(), day);
  if (due < now) due = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return due.toISOString().slice(0, 10);
}
