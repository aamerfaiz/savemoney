/**
 * Notification generator (pure).
 *
 * Derives user-facing alerts from current state — bills due, budget overspend,
 * low safe-to-spend, goal milestones, loans paid off. Each alert carries a
 * stable `dedupeKey` so read/dismiss state (persisted separately) sticks and an
 * alert isn't re-raised once handled. No I/O — the server fetches the rows and
 * hands the slim shapes here, keeping this testable.
 */

import { formatCurrency, type CurrencyCode } from "@savemoney/finance-engine/format";
import type { BillOccurrence } from "@/lib/calendar/types";
import type { NotificationDraft } from "./types";

export interface GenerateInput {
  currency: CurrencyCode;
  /** Upcoming outflow occurrences (already date-sorted). */
  bills: BillOccurrence[];
  budgets: {
    id: string;
    categoryName: string | null;
    amount: number;
    spent: number;
    status: "ok" | "warning" | "over";
  }[];
  safeToSpend: { remaining: number; overspent: boolean };
  goals: {
    id: string;
    name: string;
    currentAmount: number;
    targetAmount: number;
    status: string;
  }[];
  loans: { id: string; name: string; remainingAmount: number }[];
  /** Reference "today". */
  now?: Date;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Rank order for sorting: warnings first, then info, then positive. */
const SEVERITY_RANK: Record<NotificationDraft["severity"], number> = {
  warning: 0,
  info: 1,
  positive: 2,
};

const GOAL_MILESTONES = [100, 75, 50] as const;

export function buildNotifications(input: GenerateInput): NotificationDraft[] {
  const now = input.now ?? new Date();
  const today = iso(now);
  const monthKey = today.slice(0, 7);
  const out: NotificationDraft[] = [];

  // Bills / EMIs due within the next 5 days.
  const soonCutoff = iso(new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000));
  for (const b of input.bills) {
    if (b.kind === "income") continue;
    if (b.dueDate < today || b.dueDate > soonCutoff) continue;
    const days = Math.round(
      (new Date(b.dueDate + "T00:00:00").getTime() -
        new Date(today + "T00:00:00").getTime()) /
        (24 * 60 * 60 * 1000),
    );
    out.push({
      dedupeKey: `bill_due:${b.id}`,
      type: "bill_due",
      severity: "warning",
      title: `${b.title} due ${days <= 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
      body: `${formatCurrency(b.amount, input.currency)} ${b.kind === "emi" ? "EMI" : "bill"} is coming up.`,
      href: "/calendar",
      date: b.dueDate,
    });
  }

  // Over-budget categories this month.
  for (const b of input.budgets) {
    if (b.status !== "over") continue;
    const over = b.spent - b.amount;
    out.push({
      dedupeKey: `budget_overspend:${b.id}:${monthKey}`,
      type: "budget_overspend",
      severity: "warning",
      title: `Over budget: ${b.categoryName ?? "category"}`,
      body: `You're ${formatCurrency(over, input.currency)} over the ${formatCurrency(b.amount, input.currency)} limit.`,
      href: "/budget",
      date: today,
    });
  }

  // Safe-to-spend exhausted for the month.
  if (input.safeToSpend.overspent || input.safeToSpend.remaining < 0) {
    out.push({
      dedupeKey: `low_safe_to_spend:${monthKey}`,
      type: "low_safe_to_spend",
      severity: "warning",
      title: "Safe-to-spend is exhausted",
      body: `You've spent your discretionary budget for this month (${formatCurrency(input.safeToSpend.remaining, input.currency)} remaining).`,
      href: "/budget",
      date: today,
    });
  }

  // Goal milestones (highest crossed threshold only, per goal).
  for (const g of input.goals) {
    if (g.status !== "active" && g.status !== "completed") continue;
    if (g.targetAmount <= 0) continue;
    const pct = (g.currentAmount / g.targetAmount) * 100;
    const milestone = GOAL_MILESTONES.find((m) => pct >= m);
    if (!milestone) continue;
    const done = milestone === 100;
    out.push({
      dedupeKey: `goal_milestone:${g.id}:${milestone}`,
      type: "goal_milestone",
      severity: done ? "positive" : "info",
      title: done
        ? `Goal reached: ${g.name} 🎉`
        : `${g.name} is ${milestone}% funded`,
      body: done
        ? `You've hit your ${formatCurrency(g.targetAmount, input.currency)} target.`
        : `${formatCurrency(g.currentAmount, input.currency)} of ${formatCurrency(g.targetAmount, input.currency)} saved.`,
      href: "/goals",
      date: today,
    });
  }

  // Loans fully paid off.
  for (const l of input.loans) {
    if (l.remainingAmount > 0) continue;
    out.push({
      dedupeKey: `loan_paid_off:${l.id}`,
      type: "loan_paid_off",
      severity: "positive",
      title: `${l.name} is paid off 🎉`,
      body: "This loan has no remaining balance. One less EMI.",
      href: "/loans",
      date: today,
    });
  }

  return out.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return b.date.localeCompare(a.date);
  });
}
