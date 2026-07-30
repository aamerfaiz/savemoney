import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getProfile, getDisplayCurrency } from "@/lib/profile/queries";
import { getAnalyticsData } from "@/lib/analytics/queries";
import { getBudgetsData } from "@/lib/budgets/queries";
import { getGoalsData } from "@/lib/goals/queries";
import { getLoansData } from "@/lib/loans/queries";
import { getInvestmentsData } from "@/lib/investments/queries";
import {
  buildNetWorth,
  fetchNetWorthSnapshots,
} from "@/lib/networth/queries";
import { getTransactions } from "@/lib/transactions/queries";
import { createClient } from "@/lib/supabase/server";
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
  if (!isSupabaseConfigured()) {
    return { ...mockDashboard, currency: await getDisplayCurrency() };
  }

  const supabase = await createClient();
  const [
    profile,
    analytics,
    budgets,
    goalsData,
    loansData,
    investmentsData,
    snapshots,
    txns,
  ] = await Promise.all([
    getProfile(),
    getAnalyticsData(),
    getBudgetsData(),
    getGoalsData(),
    getLoansData(),
    getInvestmentsData(),
    fetchNetWorthSnapshots(supabase),
    getTransactions("all"),
  ]);

  const currency = profile.baseCurrency;
  const months = analytics.months;
  const thisMonth = months[months.length - 1] ?? { income: 0, expenses: 0, net: 0 };

  // Net worth: composed from the same engine the Net Worth page uses (investment
  // holdings + goal savings − outstanding debt), so the two never diverge.
  const nw = buildNetWorth({
    components: {
      investmentsValue: investmentsData.totalValue,
      goalsSaved: goalsData.totalSaved,
      loansRemaining: loansData.totalRemaining,
    },
    months,
    snapshots,
    currency,
  });
  const netWorth = nw.result.netWorth;
  const netWorthTrend = nw.trend;
  const netWorthChangePct = nw.changePct;

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
    investments: investmentsData.totalValue,
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
