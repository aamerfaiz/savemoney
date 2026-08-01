/**
 * Pure dashboard composition (Phase 3.5.3) — the exact composition logic
 * that used to live in getDashboardData(), unchanged, now taking
 * already-decrypted/computed finance data instead of fetching it itself.
 */

import { buildNetWorth } from "@/lib/networth/compute";
import { expandOccurrences, toUpcomingItems } from "@/lib/calendar/build";
import type { CurrencyCode } from "@/lib/format";
import type { BudgetsData } from "@/lib/budgets/compute";
import type { AnalyticsData } from "@/lib/analytics/types";
import type { Transaction as TxnRow } from "@/lib/transactions/types";
import type { GoalsData } from "@/lib/goals/compute";
import type { LoansData } from "@/lib/loans/compute";
import type { InvestmentsData } from "@/lib/investments/compute";
import type { RecurringData } from "@/lib/recurring/queries";
import type { SnapshotSummary } from "@/lib/networth/types";
import type {
  DashboardData,
  GoalSummary,
  Transaction as DashTxn,
  UpcomingItem,
} from "@/data/mock-dashboard";

export function computeDashboardData(input: {
  userName: string;
  currency: CurrencyCode;
  budgets: BudgetsData;
  analytics: AnalyticsData;
  transactions: TxnRow[];
  goalsData: GoalsData;
  loansData: LoansData;
  investmentsData: InvestmentsData;
  recurringData: RecurringData;
  snapshots: SnapshotSummary[];
  now?: Date;
}): DashboardData {
  const {
    userName,
    currency,
    budgets,
    analytics,
    transactions,
    goalsData,
    loansData,
    investmentsData,
    recurringData,
    snapshots,
  } = input;
  const now = input.now ?? new Date();

  const months = analytics.months;
  const thisMonth = months[months.length - 1] ?? { income: 0, expenses: 0, net: 0 };

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

  const recent: DashTxn[] = transactions.slice(0, 6).map((t) => ({
    id: t.id,
    title: t.description || t.categoryName || (t.kind === "income" ? "Income" : "Expense"),
    category: t.categoryName ?? "Uncategorized",
    amount: t.kind === "income" ? t.amount : -t.amount,
    date: t.date,
    icon: t.categoryIcon ?? "shapes",
  }));

  return {
    currency,
    userName,
    monthlyIncome: thisMonth.income,
    monthlyExpenses: thisMonth.expenses,
    savings: thisMonth.net,
    investments: investmentsData.totalValue,
    netWorth: nw.result.netWorth,
    netWorthChangePct: nw.changePct,
    cashFlow: thisMonth.net,
    budget: budgets.safeToSpend,
    health: analytics.health,
    entertainmentBudget: entertainment
      ? { spent: entertainment.spent, limit: entertainment.amount }
      : { spent: 0, limit: 0 },
    goals,
    upcoming,
    recent,
    netWorthTrend: nw.trend,
    spendingByCategory: analytics.byCategory.slice(0, 6),
  };
}
