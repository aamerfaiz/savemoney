import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { computeBudget, type BudgetResult } from "@/lib/finance/budget";
import type { CurrencyCode } from "@/lib/format";
import { demoBudgets, demoSafeToSpend } from "./mock";
import {
  budgetStatus,
  type BudgetPeriod,
  type BudgetWithProgress,
} from "./types";

export interface BudgetsData {
  budgets: BudgetWithProgress[];
  safeToSpend: BudgetResult;
  currency: CurrencyCode;
}

/** Start (inclusive) of the current period window for a given budget period. */
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

const iso = (d: Date) => d.toISOString().slice(0, 10);

type ExpenseRow = {
  category_id: string | null;
  amount: string | number;
  spent_at: string;
  is_recurring: boolean;
};

/**
 * Budgets with this-period spend joined in, plus the monthly safe-to-spend
 * figure from the budgeting engine. Demo data when Supabase isn't configured.
 */
export async function getBudgetsData(): Promise<BudgetsData> {
  if (!isSupabaseConfigured()) {
    return { budgets: demoBudgets, safeToSpend: demoSafeToSpend, currency: "USD" };
  }

  const supabase = await createClient();
  const now = new Date();

  const [{ data: budgetRows }, { data: expenseRows }, { data: incomeRows }] =
    await Promise.all([
      supabase
        .from("budgets")
        .select("id, category_id, period, amount, currency, categories(name, icon)")
        .is("deleted_at", null),
      // A year of expenses is enough to cover weekly/monthly/yearly windows.
      supabase
        .from("expenses")
        .select("category_id, amount, spent_at, is_recurring")
        .is("deleted_at", null)
        .gte("spent_at", iso(new Date(now.getFullYear(), 0, 1))),
      supabase
        .from("income")
        .select("amount")
        .is("deleted_at", null)
        .gte("received_at", iso(new Date(now.getFullYear(), now.getMonth(), 1))),
    ]);

  const expenses = (expenseRows ?? []) as ExpenseRow[];

  const budgets: BudgetWithProgress[] = (
    (budgetRows ?? []) as unknown as BudgetRow[]
  ).map((b) => {
    const period = b.period as BudgetPeriod;
    const from = iso(periodStart(period, now));
    const spent = expenses
      .filter((e) => e.spent_at >= from)
      .filter((e) => (b.category_id ? e.category_id === b.category_id : true))
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const amount = Number(b.amount);
    const utilization = amount > 0 ? spent / amount : 0;
    return {
      id: b.id,
      categoryId: b.category_id,
      categoryName: b.categories?.name ?? null,
      categoryIcon: b.categories?.icon ?? null,
      period,
      amount,
      currency: (b.currency as CurrencyCode) ?? "USD",
      spent,
      remaining: amount - spent,
      utilization,
      status: budgetStatus(utilization),
    };
  });

  // Safe-to-spend for the current month.
  const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthExpenses = expenses.filter((e) => e.spent_at >= monthStart);
  const fixedExpenses = monthExpenses
    .filter((e) => e.is_recurring)
    .reduce((s, e) => s + Number(e.amount), 0);
  const spentThisMonth = monthExpenses
    .filter((e) => !e.is_recurring)
    .reduce((s, e) => s + Number(e.amount), 0);
  const monthlyIncome = ((incomeRows ?? []) as { amount: string | number }[]).reduce(
    (s, r) => s + Number(r.amount),
    0,
  );

  const safeToSpend = computeBudget({
    monthlyIncome,
    fixedExpenses,
    // These modules aren't built yet, so they contribute 0 for now.
    investments: 0,
    loanPayments: 0,
    goalContributions: 0,
    spentThisMonth,
  });

  return { budgets, safeToSpend, currency: "USD" };
}

interface BudgetRow {
  id: string;
  category_id: string | null;
  period: string;
  amount: string | number;
  currency: string;
  categories: { name: string | null; icon: string | null } | null;
}
