import type { BudgetPeriod } from "./types";

/** Direct port of apps/web/src/lib/budgets/period.ts — pure. */
export function periodStart(period: BudgetPeriod, now = new Date()): Date {
  if (period === "weekly") {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "yearly") return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
