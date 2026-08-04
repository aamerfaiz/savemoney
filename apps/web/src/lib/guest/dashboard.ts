import { computeBudget } from "@savemoney/finance-engine/budget";
import { computeHealthScore } from "@savemoney/finance-engine/health-score";
import { computeNetWorth, trendChange } from "@savemoney/finance-engine/net-worth";
import { expandOccurrences, toUpcomingItems } from "@/lib/calendar/build";
import type {
  DashboardData,
  GoalSummary,
  Transaction as DashTxn,
  UpcomingItem,
} from "@/data/mock-dashboard";
import { loadGuestData } from "./repo";

const PALETTE = ["#8400ff", "#84cc16", "#f59e0b", "#ef4444", "#a855f7", "#94a3b8"];

/**
 * The guest-mode dashboard snapshot. Mirrors src/lib/dashboard/queries.ts's
 * getDashboardData() composition exactly — same pure engines
 * (computeBudget/computeHealthScore/computeNetWorth/expandOccurrences), just
 * fed from IndexedDB rows instead of Supabase tables. (buildNetWorth itself
 * lives in a "server-only" module, so its small trend-fallback logic is
 * reproduced inline here rather than imported.)
 */
export async function computeGuestDashboard(): Promise<DashboardData> {
  const data = await loadGuestData();

  const now = new Date();
  const monthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthKey = monthKey(now);

  const thisMonthTxns = data.transactions.filter((t) => t.date.startsWith(thisMonthKey));
  const monthlyIncome = sumKind(thisMonthTxns, "income");
  const monthlyExpenses = sumKind(thisMonthTxns, "expense");
  const savings = monthlyIncome - monthlyExpenses;

  const fixedExpenses = data.recurringRules
    .filter((r) => r.isActive && r.kind === "expense")
    .reduce((s, r) => s + r.monthlyAmount, 0);
  const loanPayments = data.loans.reduce((s, l) => s + l.emi + (l.extraEmi ?? 0), 0);
  const activeGoals = data.goals.filter((g) => g.status === "active");
  const goalContributions = activeGoals.reduce((s, g) => s + g.monthlyContribution, 0);
  const spentThisMonth = Math.max(0, monthlyExpenses - fixedExpenses);

  const budget = computeBudget({
    monthlyIncome,
    fixedExpenses,
    investments: data.investments.monthlyContribution,
    loanPayments,
    goalContributions,
    spentThisMonth,
  });

  const emergencyGoal = data.goals.find((g) => g.name === "Emergency Fund");
  const emergencyFundMonths =
    monthlyExpenses > 0 ? (emergencyGoal?.saved ?? 0) / monthlyExpenses : 0;
  const goalCompletion =
    activeGoals.length > 0
      ? activeGoals.reduce((s, g) => s + Math.min(1, g.saved / g.target), 0) / activeGoals.length
      : 0;

  const health = computeHealthScore({
    savingsRate: monthlyIncome > 0 ? savings / monthlyIncome : 0,
    emergencyFundMonths,
    debtRatio: monthlyIncome > 0 ? loanPayments / monthlyIncome : 0,
    investmentRate: monthlyIncome > 0 ? data.investments.monthlyContribution / monthlyIncome : 0,
    budgetDiscipline: 0.78,
    incomeStability: 0.9,
    goalCompletion,
  });

  const entertainmentLimit = data.budgetLimits.find((b) => b.categoryName === "Entertainment");
  const entertainmentBudget = {
    spent: sumCategory(thisMonthTxns, "Entertainment"),
    limit: entertainmentLimit?.amount ?? 0,
  };

  const goals: GoalSummary[] = activeGoals.slice(0, 3).map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    saved: g.saved,
    target: g.target,
  }));

  const upcoming: UpcomingItem[] = toUpcomingItems(
    expandOccurrences({
      rules: data.recurringRules,
      loans: data.loans,
      from: now,
      to: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
    }),
    4,
    now,
  );

  const recent: DashTxn[] = data.transactions.slice(0, 6).map((t) => ({
    id: t.id,
    title: t.description || t.categoryName || (t.kind === "income" ? "Income" : "Expense"),
    category: t.categoryName ?? "Uncategorized",
    amount: t.kind === "income" ? t.amount : -t.amount,
    date: t.date,
    icon: t.categoryIcon ?? "shapes",
  }));

  const investmentsValue = data.investments.totalValue;
  const goalsSaved = activeGoals.reduce((s, g) => s + g.saved, 0);
  const loansRemaining = data.loans.reduce((s, l) => s + l.remainingAmount, 0);

  const netWorthResult = computeNetWorth([
    { key: "investments", label: "Investments", icon: "trending-up", amount: investmentsValue, kind: "asset" },
    { key: "goals", label: "Goal savings", icon: "target", amount: goalsSaved, kind: "asset" },
    { key: "loans", label: "Loans", icon: "landmark", amount: loansRemaining, kind: "liability" },
  ]);

  // No persisted snapshots in guest mode — reconstruct the trend backward
  // from today's net worth using each month's net cash flow, same fallback
  // buildNetWorth() uses server-side.
  const months = last6Months(now).map((d) => ({
    label: shortMonth(d),
    net: sumKind(
      data.transactions.filter((t) => t.date.startsWith(monthKey(d))),
      "income",
    ) -
      sumKind(
        data.transactions.filter((t) => t.date.startsWith(monthKey(d))),
        "expense",
      ),
  }));
  const netWorthTrend: { month: string; value: number }[] = [];
  let running = netWorthResult.netWorth;
  for (let i = months.length - 1; i >= 0; i--) {
    netWorthTrend.unshift({ month: months[i].label, value: Math.round(running) });
    running -= months[i].net;
  }
  const { changePct: netWorthChangePct } = trendChange(netWorthTrend);

  const spendingByCategory = Object.entries(
    thisMonthTxns
      .filter((t) => t.kind === "expense")
      .reduce<Record<string, number>>((acc, t) => {
        const key = t.categoryName ?? "Other";
        acc[key] = (acc[key] ?? 0) + t.amount;
        return acc;
      }, {}),
  )
    .map(([category, amount], i) => ({ category, amount, color: PALETTE[i % PALETTE.length] }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  return {
    currency: data.profile.baseCurrency,
    userName: data.profile.name,
    monthlyIncome,
    monthlyExpenses,
    savings,
    investments: investmentsValue,
    netWorth: netWorthResult.netWorth,
    netWorthChangePct,
    cashFlow: savings,
    budget,
    health,
    entertainmentBudget,
    goals,
    upcoming,
    recent,
    netWorthTrend,
    spendingByCategory,
  };
}

function sumKind(txns: { kind: string; amount: number }[], kind: "income" | "expense"): number {
  return txns.filter((t) => t.kind === kind).reduce((s, t) => s + t.amount, 0);
}

function sumCategory(
  txns: { kind: string; categoryName: string | null; amount: number }[],
  categoryName: string,
): number {
  return txns
    .filter((t) => t.kind === "expense" && t.categoryName === categoryName)
    .reduce((s, t) => s + t.amount, 0);
}

function last6Months(today: Date): Date[] {
  return Array.from({ length: 6 }, (_, i) => new Date(today.getFullYear(), today.getMonth() - (5 - i), 1));
}

function shortMonth(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(d);
}
