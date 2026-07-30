import {
  monthlyAmount,
  nextOccurrence,
  type RecurringFrequency,
} from "@/lib/finance/recurring";
import type { RecurringKind, RecurringRuleWithSchedule } from "./types";

/** Demo recurring rules so the page renders without a configured backend. */
export const demoRecurringRules: RecurringRuleWithSchedule[] = [
  mk("Rent", "expense", 1600, "monthly", 1, "home", "2023-01-01"),
  mk("Netflix", "expense", 15.99, "monthly", 1, "clapperboard", "2023-03-12"),
  mk("Electricity", "expense", 96, "monthly", 1, "plug", "2023-02-05"),
  mk("Gym membership", "expense", 42, "monthly", 1, "heart-pulse", "2023-06-20"),
  mk("Car insurance", "expense", 540, "yearly", 1, "car", "2023-09-01"),
  mk("Salary", "income", 8200, "monthly", 1, "wallet", "2022-01-01"),
];

function mk(
  name: string,
  kind: RecurringKind,
  amount: number,
  frequency: RecurringFrequency,
  interval: number,
  categoryIcon: string,
  startDate: string,
): RecurringRuleWithSchedule {
  const rule = { startDate, frequency, interval, endDate: null };
  return {
    id: `demo-${name}`,
    name,
    kind,
    categoryId: null,
    categoryName: name,
    categoryIcon,
    accountId: null,
    amount,
    currency: "USD",
    frequency,
    interval,
    startDate,
    endDate: null,
    isActive: true,
    note: null,
    nextDate: nextOccurrence(rule),
    monthlyAmount: monthlyAmount(amount, rule),
  };
}
