import type { BudgetPeriod } from "./types";

/** Start (inclusive) of the current period window for a given budget period.
 * Pure — no I/O — so it's callable from both server and client code. */
export function periodStart(period: BudgetPeriod, now = new Date()): Date {
  if (period === "weekly") {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "yearly") return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1); // monthly
}
