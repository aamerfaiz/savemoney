import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getBillCalendarData } from "@/lib/calendar/queries";
import { getBudgetsData } from "@/lib/budgets/queries";
import { getGoalsData } from "@/lib/goals/queries";
import { getLoansData } from "@/lib/loans/queries";
import { getDisplayCurrency } from "@/lib/profile/queries";
import { buildNotifications } from "./generate";
import type { NotificationItem } from "./types";

export interface NotificationsData {
  items: NotificationItem[];
  unreadCount: number;
}

/**
 * Live-derived alerts with persisted read/dismiss state applied. Dismissed
 * alerts are dropped; the rest carry their read flag. Composed from the same
 * module queries the dashboard uses, so alerts never contradict the numbers.
 */
export async function getNotificationsData(): Promise<NotificationsData> {
  const [calendar, budgets, goals, loans, currency] = await Promise.all([
    getBillCalendarData(),
    getBudgetsData(),
    getGoalsData(),
    getLoansData(),
    getDisplayCurrency(),
  ]);

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

  const state = await fetchState();

  const items: NotificationItem[] = drafts
    .filter((d) => !state.get(d.dedupeKey)?.dismissed)
    .map((d) => ({ ...d, isRead: state.get(d.dedupeKey)?.read ?? false }));

  return {
    items,
    unreadCount: items.filter((i) => !i.isRead).length,
  };
}

/** dedupeKey → persisted read/dismiss flags. */
async function fetchState(): Promise<
  Map<string, { read: boolean; dismissed: boolean }>
> {
  const map = new Map<string, { read: boolean; dismissed: boolean }>();

  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("dedupe_key, is_read, is_dismissed")
    .is("deleted_at", null)
    .not("dedupe_key", "is", null);

  for (const r of (data ?? []) as {
    dedupe_key: string;
    is_read: boolean;
    is_dismissed: boolean;
  }[]) {
    map.set(r.dedupe_key, { read: r.is_read, dismissed: r.is_dismissed });
  }
  return map;
}
