import "server-only";

import { getProfile } from "@/lib/profile/queries";
import { getAnalyticsData } from "@/lib/analytics/queries";
import { getBudgetsData } from "@/lib/budgets/queries";
import { getGoalsData } from "@/lib/goals/queries";
import { getLoansData } from "@/lib/loans/queries";
import { getInvestmentsData } from "@/lib/investments/queries";
import { getRecurringData } from "@/lib/recurring/queries";
import { expandOccurrences, toUpcomingItems } from "@/lib/calendar/build";
import {
  buildNetWorth,
  fetchNetWorthSnapshots,
} from "@/lib/networth/queries";
import { getTransactions } from "@/lib/transactions/queries";
import { createClient } from "@/lib/supabase/server";
import type {
  DashboardData,
  GoalSummary,
  Transaction as DashTxn,
  UpcomingItem,
} from "@/data/mock-dashboard";

/** The dashboard snapshot, composed entirely from the real module queries. */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const [
    profile,
    analytics,
    budgets,
    goalsData,
    loansData,
    investmentsData,
    recurringData,
    snapshots,
    txns,
  ] = await Promise.all([
    getProfile(),
    getAnalyticsData(),
    getBudgetsData(),
    getGoalsData(),
    getLoansData(),
    getInvestmentsData(),
    getRecurringData(),
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

  // Upcoming bills + EMIs, composed from the same expansion the calendar uses
  // so the dashboard card and the calendar page never diverge.
  const now = new Date();
  const upcoming: UpcomingItem[] = toUpcomingItems(
    expandOccurrences({
      rules: recurringData.rules,
      loans: loansData.loans,
      from: now,
      to: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
    }),
    4,
    now,
  );

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
