/**
 * Pure analytics computation (Phase 3.5.3) — the exact aggregation logic
 * that used to live in getAnalyticsData(), unchanged, now taking
 * already-decrypted rows instead of fetching+decrypting itself. See
 * src/lib/budgets/compute.ts for why this has to be pure/client-callable.
 */

import { computeHealthScore } from "@savemoney/finance-engine/health-score";
import { computeGoalProjection } from "@savemoney/finance-engine/goals";
import type { CurrencyCode } from "@/lib/format";
import type {
  DecryptedActiveGoal,
  DecryptedContributionRow,
  DecryptedExpenseRow,
  DecryptedIncomeRow,
  DecryptedInvestmentContribution,
  DecryptedLoanAmounts,
} from "@/lib/finance/decrypt";
import { CATEGORY_PALETTE, type AnalyticsData, type CategorySlice, type MonthPoint } from "./types";

const RANGE_MONTHS = 6;

export function computeAnalyticsData(
  income: DecryptedIncomeRow[],
  expenses: DecryptedExpenseRow[],
  decryptedActiveGoals: DecryptedActiveGoal[],
  decryptedLoans: DecryptedLoanAmounts[],
  decryptedContributions: DecryptedContributionRow[],
  decryptedInvestmentContributions: DecryptedInvestmentContribution[],
  currency: CurrencyCode,
  now = new Date(),
): AnalyticsData {
  const months = buildMonthBuckets(now);
  const index = new Map(months.map((m, i) => [m.key, i]));

  for (const r of income) {
    const i = index.get(r.receivedAt.slice(0, 7));
    if (i != null) months[i].income += r.amount;
  }
  for (const r of expenses) {
    const i = index.get(r.spentAt.slice(0, 7));
    if (i != null) months[i].expenses += r.amount;
  }
  for (const r of decryptedContributions) {
    const i = index.get(r.contributedAt.slice(0, 7));
    if (i != null) months[i].contributed += r.amount;
  }
  for (const m of months) {
    m.net = m.income - m.expenses;
    m.savingsRate = savingsRateOf(m.income, m.net, m.contributed);
  }

  const byCategory = aggregateByCategory(expenses);

  const totals = totalsFrom(months);
  const totalEmi = decryptedLoans
    .filter((l) => l.remainingAmount > 0)
    .reduce((s, l) => s + l.emi + l.extraEmi, 0);

  const goalCompletion = goalCompletionShare(decryptedActiveGoals);
  const investedThisWindow = decryptedInvestmentContributions.reduce((s, r) => s + r.amount, 0);
  const investmentRate = totals.income > 0 ? investedThisWindow / totals.income : 0;
  const health = deriveHealth(months, totals, totalEmi, goalCompletion, investmentRate);

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

function savingsRateOf(income: number, net: number, contributed: number): number {
  return income > 0 ? Math.max(net, contributed) / income : 0;
}

function aggregateByCategory(expenses: DecryptedExpenseRow[]): CategorySlice[] {
  const map = new Map<string, { amount: number; color: string | null }>();
  for (const r of expenses) {
    const name = r.categoryName ?? "Uncategorized";
    const entry = map.get(name) ?? { amount: 0, color: r.categoryColor ?? null };
    entry.amount += r.amount;
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

function goalCompletionShare(goals: DecryptedActiveGoal[]): number {
  if (goals.length === 0) return 0.6;
  const onTrack = goals.filter((g) => {
    const { onTrack } = computeGoalProjection({
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      monthlyContribution: g.monthlyContribution,
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
  const meanIncome = incomes.reduce((s, v) => s + v, 0) / (incomes.length || 1);
  const variance =
    incomes.reduce((s, v) => s + (v - meanIncome) ** 2, 0) / (incomes.length || 1);
  const cv = meanIncome > 0 ? Math.sqrt(variance) / meanIncome : 1;
  const incomeStability = Math.max(0, Math.min(1, 1 - cv));

  const debtRatio = meanIncome > 0 ? totalEmi / meanIncome : 0;

  return computeHealthScore({
    savingsRate: totals.savingsRate,
    debtRatio,
    incomeStability,
    investmentRate,
    emergencyFundMonths: 3,
    budgetDiscipline: 0.7,
    goalCompletion,
  });
}
