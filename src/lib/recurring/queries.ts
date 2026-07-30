import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getDisplayCurrency } from "@/lib/profile/queries";
import {
  monthlyAmount,
  nextOccurrence,
  type RecurringFrequency,
} from "@/lib/finance/recurring";
import type { CurrencyCode } from "@/lib/format";
import type { RecurringKind, RecurringRuleWithSchedule } from "./types";

export interface RecurringData {
  rules: RecurringRuleWithSchedule[];
  /** Active expense outflow normalized to a month — feeds safe-to-spend. */
  monthlyExpense: number;
  /** Active income normalized to a month. */
  monthlyIncome: number;
  currency: CurrencyCode;
}

interface RecurringRow {
  id: string;
  name: string;
  kind: string;
  category_id: string | null;
  account_id: string | null;
  amount: string | number;
  currency: string;
  frequency: string;
  interval: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  note: string | null;
  categories: { name: string | null; icon: string | null } | null;
}

/** Recurring rules with their next occurrence + monthly-normalized amounts. */
export async function getRecurringData(): Promise<RecurringData> {
  const currency = await getDisplayCurrency();
  const raw = await fetchRules();
  const rules = raw.map((r) => ({ ...r, currency }));

  const active = rules.filter((r) => r.isActive && r.nextDate);
  const monthlyExpense = active
    .filter((r) => r.kind === "expense")
    .reduce((s, r) => s + r.monthlyAmount, 0);
  const monthlyIncome = active
    .filter((r) => r.kind === "income")
    .reduce((s, r) => s + r.monthlyAmount, 0);

  return { rules, monthlyExpense, monthlyIncome, currency };
}

async function fetchRules(): Promise<RecurringRuleWithSchedule[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recurring_rules")
    .select(
      "id, name, kind, category_id, account_id, amount, currency, frequency, interval, start_date, end_date, is_active, note, categories(name, icon)",
    )
    .is("deleted_at", null)
    .order("is_active", { ascending: false })
    .order("start_date", { ascending: true });

  return ((data ?? []) as unknown as RecurringRow[]).map(mapRow);
}

function mapRow(r: RecurringRow): RecurringRuleWithSchedule {
  const amount = Number(r.amount);
  const frequency = r.frequency as RecurringFrequency;
  const interval = r.interval ?? 1;
  const rule = {
    startDate: r.start_date,
    frequency,
    interval,
    endDate: r.end_date,
  };
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as RecurringKind,
    categoryId: r.category_id,
    categoryName: r.categories?.name ?? null,
    categoryIcon: r.categories?.icon ?? null,
    accountId: r.account_id,
    amount,
    currency: (r.currency as CurrencyCode) ?? "USD",
    frequency,
    interval,
    startDate: r.start_date,
    endDate: r.end_date,
    isActive: r.is_active,
    note: r.note,
    nextDate: r.is_active ? nextOccurrence(rule) : null,
    monthlyAmount: monthlyAmount(amount, rule),
  };
}
