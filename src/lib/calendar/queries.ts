import "server-only";

import { getDisplayCurrency } from "@/lib/profile/queries";
import type { CurrencyCode } from "@/lib/format";
import { expandOccurrences } from "./build";
import type { BillOccurrence } from "./types";
import type { LoanWithProjection } from "@/lib/loans/types";
import type { RecurringRuleWithSchedule } from "@/lib/recurring/types";

export interface BillCalendarData {
  occurrences: BillOccurrence[];
  /** First day of the currently-shown month (ISO yyyy-mm-dd). */
  monthStart: string;
  /** Total outflow (bills + EMIs) falling in the current calendar month. */
  monthOutflow: number;
  /** Total outflow due in the next 30 days from today. */
  next30Outflow: number;
  currency: CurrencyCode;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Occurrences for the current month + the upcoming ~2 months, with totals.
 * `loans`/`rules` arrive already-decrypted from the caller (Phase 3.5.4) —
 * this can no longer fetch+decrypt either itself server-side. */
export async function getBillCalendarData(
  loans: LoanWithProjection[],
  rules: RecurringRuleWithSchedule[],
  now = new Date(),
): Promise<BillCalendarData> {
  const currency = await getDisplayCurrency();

  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0);

  const occurrences = expandOccurrences({
    rules,
    loans,
    from: monthStartDate,
    to,
  }).map((o) => ({ ...o, currency }));

  const monthEnd = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const monthStart = iso(monthStartDate);
  const in30 = iso(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
  const today = iso(now);

  const outflows = occurrences.filter((o) => o.kind !== "income");
  const monthOutflow = outflows
    .filter((o) => o.dueDate >= monthStart && o.dueDate <= monthEnd)
    .reduce((s, o) => s + o.amount, 0);
  const next30Outflow = outflows
    .filter((o) => o.dueDate >= today && o.dueDate <= in30)
    .reduce((s, o) => s + o.amount, 0);

  return {
    occurrences,
    monthStart,
    monthOutflow,
    next30Outflow,
    currency,
  };
}
