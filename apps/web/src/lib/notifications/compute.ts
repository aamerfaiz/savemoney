/**
 * Pure notifications composition (Phase 3.5.3) — the exact logic that used
 * to live in getNotificationsData(), unchanged, now taking already-fetched
 * budgets/goals/loans/calendar/state instead of fetching them itself.
 */

import { buildNotifications } from "./generate";
import type { NotificationItem } from "./types";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { BudgetsData } from "@/lib/budgets/compute";
import type { GoalsData } from "@/lib/goals/compute";
import type { LoansData } from "@/lib/loans/compute";
import type { BillCalendarData } from "@/lib/calendar/queries";

export interface NotificationsData {
  items: NotificationItem[];
  unreadCount: number;
}

export function computeNotificationsData(input: {
  currency: CurrencyCode;
  calendar: BillCalendarData;
  budgets: BudgetsData;
  goals: GoalsData;
  loans: LoansData;
  state: Record<string, { read: boolean; dismissed: boolean }>;
}): NotificationsData {
  const { currency, calendar, budgets, goals, loans, state } = input;

  const drafts = buildNotifications({
    currency,
    bills: calendar.occurrences,
    budgets: budgets.budgets.map((b) => ({
      id: b.id,
      categoryName: b.categoryName,
      amount: b.amount,
      spent: b.spent,
      status: b.status,
    })),
    safeToSpend: {
      remaining: budgets.safeToSpend.remaining,
      overspent: budgets.safeToSpend.overspent,
    },
    goals: goals.goals.map((g) => ({
      id: g.id,
      name: g.name,
      currentAmount: g.currentAmount,
      targetAmount: g.targetAmount,
      status: g.status,
    })),
    loans: loans.loans.map((l) => ({
      id: l.id,
      name: l.name,
      remainingAmount: l.remainingAmount,
    })),
  });

  const items: NotificationItem[] = drafts
    .filter((d) => !state[d.dedupeKey]?.dismissed)
    .map((d) => ({ ...d, isRead: state[d.dedupeKey]?.read ?? false }));

  return {
    items,
    unreadCount: items.filter((i) => !i.isRead).length,
  };
}
