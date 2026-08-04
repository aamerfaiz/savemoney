/**
 * Bill-calendar composition (pure).
 *
 * Expands recurring rules and loan EMIs into concrete dated occurrences inside
 * a window, so the calendar page and the dashboard "upcoming" card read from
 * one source. No I/O — the server fetches the rows and hands them here.
 */

import { occurrencesBetween } from "@savemoney/finance-engine/recurring";
import type { UpcomingItem } from "@/data/mock-dashboard";
import type { RecurringRuleWithSchedule } from "@/lib/recurring/types";
import type { LoanWithProjection } from "@/lib/loans/types";
import type { BillOccurrence } from "./types";

export interface ExpandInput {
  rules: RecurringRuleWithSchedule[];
  loans: LoanWithProjection[];
  from: Date;
  to: Date;
}

/** Every recurring-rule + loan-EMI occurrence in [from, to], date-sorted. */
export function expandOccurrences({
  rules,
  loans,
  from,
  to,
}: ExpandInput): BillOccurrence[] {
  const out: BillOccurrence[] = [];

  for (const r of rules) {
    if (!r.isActive) continue;
    const dates = occurrencesBetween(
      {
        startDate: r.startDate,
        frequency: r.frequency,
        interval: r.interval,
        endDate: r.endDate,
      },
      from,
      to,
    );
    for (const dueDate of dates) {
      out.push({
        id: `recurring:${r.id}:${dueDate}`,
        sourceId: r.id,
        sourceKind: "recurring",
        title: r.name,
        amount: r.amount,
        kind: r.kind === "income" ? "income" : "bill",
        dueDate,
        icon: r.categoryIcon ?? (r.kind === "income" ? "wallet" : "receipt"),
        currency: r.currency,
      });
    }
  }

  for (const l of loans) {
    if (l.remainingAmount <= 0 || l.emi <= 0) continue;
    // EMIs recur monthly on the loan's start day-of-month.
    const dates = occurrencesBetween(
      { startDate: l.startDate, frequency: "monthly", interval: 1, endDate: null },
      from,
      to,
    );
    const due = l.emi + (l.extraEmi ?? 0);
    for (const dueDate of dates) {
      out.push({
        id: `loan:${l.id}:${dueDate}`,
        sourceId: l.id,
        sourceKind: "loan",
        title: `${l.name} EMI`,
        amount: due,
        kind: "emi",
        dueDate,
        icon: "landmark",
        currency: l.currency,
      });
    }
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * The next `limit` outflow occurrences (bills + EMIs) on/after today, one per
 * source at most, mapped to the dashboard's UpcomingItem shape. Deduped by
 * `sourceKind:sourceId` — `occurrences` spans a multi-month window (see
 * computeDashboardData's 90-day lookahead), so a single monthly EMI or
 * recurring rule can legitimately appear more than once in there. Without
 * this, one bill recurring inside the window can fill most or all of the
 * card's slots with itself and crowd out everything else due later. Callers
 * that want every occurrence in the window (the full Bill Calendar page) use
 * `expandOccurrences` directly instead of this.
 */
export function toUpcomingItems(
  occurrences: BillOccurrence[],
  limit = 4,
  today: Date = new Date(),
): UpcomingItem[] {
  const from = today.toISOString().slice(0, 10);
  const seenSources = new Set<string>();
  const deduped: BillOccurrence[] = [];

  for (const o of occurrences) {
    if (o.kind === "income" || o.dueDate < from) continue;
    const sourceKey = `${o.sourceKind}:${o.sourceId}`;
    if (seenSources.has(sourceKey)) continue;
    seenSources.add(sourceKey);
    deduped.push(o);
  }

  return deduped.slice(0, limit).map((o) => ({
    id: o.id,
    title: o.title,
    amount: o.amount,
    dueDate: o.dueDate,
    kind: o.kind === "emi" ? "emi" : "bill",
  }));
}
