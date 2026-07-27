import type { CurrencyCode } from "@/lib/format";
import { computeBudget, type BudgetResult } from "@/lib/finance/budget";
import {
  computeHealthScore,
  type HealthResult,
} from "@/lib/finance/health-score";

/**
 * Mock dashboard snapshot used while the Supabase data layer is being wired.
 * Swap `getDashboardData()` for a real query later — the shape is the contract.
 */

export interface Transaction {
  id: string;
  title: string;
  category: string;
  amount: number; // negative = expense
  date: string; // ISO
  icon: string;
}

export interface UpcomingItem {
  id: string;
  title: string;
  amount: number;
  dueDate: string; // ISO
  kind: "bill" | "emi";
}

export interface GoalSummary {
  id: string;
  name: string;
  icon: string;
  saved: number;
  target: number;
}

export interface DashboardData {
  currency: CurrencyCode;
  userName: string;
  monthlyIncome: number;
  monthlyExpenses: number;
  savings: number;
  investments: number;
  netWorth: number;
  netWorthChangePct: number;
  cashFlow: number;
  budget: BudgetResult;
  health: HealthResult;
  entertainmentBudget: { spent: number; limit: number };
  goals: GoalSummary[];
  upcoming: UpcomingItem[];
  recent: Transaction[];
  netWorthTrend: { month: string; value: number }[];
  spendingByCategory: { category: string; amount: number; color: string }[];
}

const monthlyIncome = 8200;
const fixedExpenses = 2450;
const investments = 1200;
const loanPayments = 980;
const goalContributions = 700;
const monthlyExpenses = 4380;
const spentThisMonth = 2130;

const budget = computeBudget({
  monthlyIncome,
  fixedExpenses,
  investments,
  loanPayments,
  goalContributions,
  spentThisMonth,
});

const health = computeHealthScore({
  savingsRate: (monthlyIncome - monthlyExpenses) / monthlyIncome,
  emergencyFundMonths: 4.5,
  debtRatio: loanPayments / monthlyIncome,
  investmentRate: investments / monthlyIncome,
  budgetDiscipline: 0.78,
  incomeStability: 0.9,
  goalCompletion: 0.6,
});

export const mockDashboard: DashboardData = {
  currency: "USD",
  userName: "there",
  monthlyIncome,
  monthlyExpenses,
  savings: monthlyIncome - monthlyExpenses,
  investments,
  netWorth: 128450,
  netWorthChangePct: 0.032,
  cashFlow: monthlyIncome - monthlyExpenses,
  budget,
  health,
  entertainmentBudget: { spent: 210, limit: 400 },
  goals: [
    { id: "g1", name: "Emergency Fund", icon: "shield", saved: 13500, target: 20000 },
    { id: "g2", name: "New Car", icon: "car", saved: 8200, target: 25000 },
    { id: "g3", name: "Japan Trip", icon: "plane", saved: 2400, target: 6000 },
  ],
  upcoming: [
    { id: "u1", title: "Home Loan EMI", amount: 720, dueDate: addDays(3), kind: "emi" },
    { id: "u2", title: "Electricity", amount: 96, dueDate: addDays(5), kind: "bill" },
    { id: "u3", title: "Internet", amount: 55, dueDate: addDays(8), kind: "bill" },
    { id: "u4", title: "Car Loan EMI", amount: 260, dueDate: addDays(11), kind: "emi" },
  ],
  recent: [
    { id: "t1", title: "Whole Foods", category: "Groceries", amount: -84.2, date: addDays(-0), icon: "shopping-cart" },
    { id: "t2", title: "Salary", category: "Salary", amount: 8200, date: addDays(-1), icon: "wallet" },
    { id: "t3", title: "Netflix", category: "Entertainment", amount: -15.99, date: addDays(-2), icon: "clapperboard" },
    { id: "t4", title: "Shell", category: "Fuel", amount: -52.4, date: addDays(-2), icon: "fuel" },
    { id: "t5", title: "Dividend — VOO", category: "Dividend", amount: 42.1, date: addDays(-3), icon: "coins" },
    { id: "t6", title: "Dinner — Nobu", category: "Food", amount: -128.0, date: addDays(-4), icon: "utensils" },
  ],
  netWorthTrend: [
    { month: "Feb", value: 118200 },
    { month: "Mar", value: 120100 },
    { month: "Apr", value: 121800 },
    { month: "May", value: 123900 },
    { month: "Jun", value: 124450 },
    { month: "Jul", value: 128450 },
  ],
  spendingByCategory: [
    { category: "Rent", amount: 1600, color: "#8400ff" },
    { category: "Groceries", amount: 620, color: "#84cc16" },
    { category: "Food", amount: 480, color: "#f59e0b" },
    { category: "Fuel", amount: 240, color: "#ef4444" },
    { category: "Entertainment", amount: 210, color: "#a855f7" },
    { category: "Other", amount: 300, color: "#94a3b8" },
  ],
};

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
// Real composition lives in src/lib/dashboard/queries.ts; this file only
// provides the shape (DashboardData) and the demo-mode fallback (mockDashboard).
