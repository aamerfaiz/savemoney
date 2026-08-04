import type { CurrencyCode } from "@/lib/format";
import type { HealthResult } from "@savemoney/finance-engine/health-score";

export interface MonthPoint {
  key: string; // YYYY-MM
  label: string; // "Jul"
  income: number;
  expenses: number;
  net: number;
  /** Money moved into savings goals this month (goal_contributions). */
  contributed: number;
  savingsRate: number; // 0–1
}

export interface CategorySlice {
  category: string;
  amount: number;
  color: string;
}

export interface AnalyticsTotals {
  income: number;
  expenses: number;
  net: number;
  /** Total moved into savings goals over the range. */
  contributed: number;
  savingsRate: number; // 0–1 over the range
  avgMonthlyExpense: number;
}

export interface AnalyticsData {
  monthsCount: number;
  months: MonthPoint[];
  totals: AnalyticsTotals;
  byCategory: CategorySlice[]; // expenses, largest first
  health: HealthResult;
  currency: CurrencyCode;
}

/** Fallback palette for categories that don't carry their own colour. */
export const CATEGORY_PALETTE = [
  "#8400ff",
  "#84cc16",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#38bdf8",
  "#22c55e",
  "#ec4899",
  "#6366f1",
  "#94a3b8",
];
