import { computeHealthScore } from "@/lib/finance/health-score";
import type { AnalyticsData, MonthPoint } from "./types";

const RAW: { label: string; income: number; expenses: number; contributed: number }[] = [
  { label: "Feb", income: 8100, expenses: 4600, contributed: 600 },
  { label: "Mar", income: 8200, expenses: 4210, contributed: 600 },
  { label: "Apr", income: 8600, expenses: 5100, contributed: 800 },
  { label: "May", income: 8200, expenses: 3980, contributed: 600 },
  { label: "Jun", income: 8300, expenses: 4520, contributed: 700 },
  { label: "Jul", income: 8692, expenses: 4380, contributed: 750 },
];

const savingsRateOf = (income: number, net: number, contributed: number) =>
  income > 0 ? Math.max(net, contributed) / income : 0;

const months: MonthPoint[] = RAW.map((r, i) => {
  const net = r.income - r.expenses;
  return {
    key: `2026-${String(2 + i).padStart(2, "0")}`,
    label: r.label,
    income: r.income,
    expenses: r.expenses,
    net,
    contributed: r.contributed,
    savingsRate: savingsRateOf(r.income, net, r.contributed),
  };
});

const income = months.reduce((s, m) => s + m.income, 0);
const expenses = months.reduce((s, m) => s + m.expenses, 0);
const contributed = months.reduce((s, m) => s + m.contributed, 0);
const net = income - expenses;

export const demoAnalytics: AnalyticsData = {
  monthsCount: 6,
  months,
  totals: {
    income,
    expenses,
    net,
    contributed,
    savingsRate: savingsRateOf(income, net, contributed),
    avgMonthlyExpense: expenses / months.length,
  },
  byCategory: [
    { category: "Rent", amount: 9600, color: "#8400ff" },
    { category: "Groceries", amount: 3720, color: "#84cc16" },
    { category: "Food", amount: 2880, color: "#f59e0b" },
    { category: "Fuel", amount: 1440, color: "#ef4444" },
    { category: "Entertainment", amount: 1260, color: "#a855f7" },
    { category: "Shopping", amount: 980, color: "#ec4899" },
    { category: "Other", amount: 1810, color: "#94a3b8" },
  ],
  health: computeHealthScore({
    savingsRate: net / income,
    emergencyFundMonths: 4.5,
    debtRatio: 0.27,
    investmentRate: 0.14,
    budgetDiscipline: 0.78,
    incomeStability: 0.9,
    goalCompletion: 0.6,
  }),
  currency: "USD",
};
