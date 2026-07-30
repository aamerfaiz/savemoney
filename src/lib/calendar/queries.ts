import "server-only";

import { getRecurringData } from "@/lib/recurring/queries";
import { getLoansData } from "@/lib/loans/queries";
import { getDisplayCurrency } from "@/lib/profile/queries";
import type { CurrencyCode } from "@/lib/format";
import type { UpcomingItem } from "@/data/mock-dashboard";
import { expandOccurrences, toUpcomingItems } from "./build";
import type { BillOccurrence } from "./types";

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

/** Occurrences for the current month + the upcoming ~2 months, with totals. */
export async function getBillCalendarData(
  now = new Date(),
): Promise<BillCalendarData> {
  const [recurring, loans, currency] = await Promise.all([
    getRecurringData(),
    getLoansData(),
    getDisplayCurrency(),
  ]);

  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0);

  const occurrences = expandOccurrences({
    rules: recurring.rules,
    loans: loans.loans,
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

/**
 * The next `limit` upcoming bills + EMIs for the dashboard card. Composed from
 * the same expansion the calendar uses, so the two never diverge.
 */
export async function getUpcomingBills(
  limit = 4,
  now = new Date(),
): Promise<UpcomingItem[]> {
  const [recurring, loans] = await Promise.all([
    getRecurringData(),
    getLoansData(),
  ]);
  const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const occurrences = expandOccurrences({
    rules: recurring.rules,
    loans: loans.loans,
    from: now,
    to,
  });
  return toUpcomingItems(occurrences, limit, now);
}
