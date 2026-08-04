import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { HealthResult } from "@savemoney/finance-engine/health-score";

/** Direct port of apps/web/src/lib/analytics/types.ts. */
export interface MonthPoint {
  key: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
  contributed: number;
  savingsRate: number;
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
  contributed: number;
  savingsRate: number;
  avgMonthlyExpense: number;
}

export interface AnalyticsData {
  monthsCount: number;
  months: MonthPoint[];
  totals: AnalyticsTotals;
  byCategory: CategorySlice[];
  health: HealthResult;
  currency: CurrencyCode;
}

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
