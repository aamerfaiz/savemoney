/**
 * Pure recurring-rules computation (Phase 3.5.4) — the schedule/totals logic
 * that used to live in getRecurringData(), unchanged, now taking already-
 * decrypted rows instead of fetching+decrypting itself. No I/O, no
 * "server-only" — callable from client code, which is where it now has to
 * run since only the browser (vault unlocked) can decrypt rule amounts. The
 * old DB-level `ORDER BY is_active, start_date` moves to a client-side sort
 * here too, mirroring src/lib/goals/compute.ts / src/lib/loans/compute.ts /
 * src/lib/investments/compute.ts.
 */

import { monthlyAmount, nextOccurrence, type RecurringFrequency } from "@/lib/finance/recurring";
import type { CurrencyCode } from "@/lib/format";
import type { DecryptedRecurringRow } from "@/lib/finance/decrypt";
import type { RecurringRuleWithSchedule } from "./types";

export interface RecurringData {
  rules: RecurringRuleWithSchedule[];
  /** Active expense outflow normalized to a month — feeds safe-to-spend. */
  monthlyExpense: number;
  /** Active income normalized to a month. */
  monthlyIncome: number;
  currency: CurrencyCode;
}

export function computeRecurringData(
  rows: DecryptedRecurringRow[],
  currency: CurrencyCode,
): RecurringData {
  const rules: RecurringRuleWithSchedule[] = rows
    .map((r) => {
      const frequency = r.frequency as RecurringFrequency;
      const schedule = {
        startDate: r.startDate,
        frequency,
        interval: r.interval,
        endDate: r.endDate,
      };
      return {
        id: r.id,
        name: r.name,
        kind: r.kind,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        categoryIcon: r.categoryIcon,
        accountId: r.accountId,
        amount: r.amount,
        currency,
        frequency,
        interval: r.interval,
        startDate: r.startDate,
        endDate: r.endDate,
        isActive: r.isActive,
        note: r.note,
        nextDate: r.isActive ? nextOccurrence(schedule) : null,
        monthlyAmount: monthlyAmount(r.amount, schedule),
      };
    })
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0;
    });

  const active = rules.filter((r) => r.isActive && r.nextDate);
  const monthlyExpense = active
    .filter((r) => r.kind === "expense")
    .reduce((s, r) => s + r.monthlyAmount, 0);
  const monthlyIncome = active
    .filter((r) => r.kind === "income")
    .reduce((s, r) => s + r.monthlyAmount, 0);

  return { rules, monthlyExpense, monthlyIncome, currency };
}
