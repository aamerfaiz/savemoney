import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { BudgetResult } from "@savemoney/finance-engine/budget";
import type { HealthResult } from "@savemoney/finance-engine/health-score";

/**
 * The dashboard data contract, shared by the real query (src/lib/dashboard/
 * queries.ts) and the guest-mode computation (src/lib/guest/dashboard.ts).
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
