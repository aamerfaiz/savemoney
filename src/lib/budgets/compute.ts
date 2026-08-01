/**
 * Pure budgets computation (Phase 3.5.3) — the exact aggregation logic that
 * used to live in getBudgetsData(), unchanged, now taking already-decrypted
 * rows instead of fetching+decrypting itself. No I/O, no "server-only" —
 * callable from client code, which is where it now has to run since only
 * the browser (vault unlocked) can decrypt income/expenses. See
 * docs/e2ee-path-b-plan.md "Architecture shift."
 */

import { computeBudget, type BudgetResult } from "@/lib/finance/budget";
import type { CurrencyCode } from "@/lib/format";
import type {
  DecryptedActiveGoal,
  DecryptedBudgetRow,
  DecryptedExpenseRow,
  DecryptedIncomeRow,
  DecryptedLoanAmounts,
} from "@/lib/finance/decrypt";
import type { FinanceRawData } from "@/lib/finance/raw-data";
import { budgetStatus, type BudgetPeriod, type BudgetWithProgress } from "./types";
import { periodStart } from "./period";

export interface BudgetsData {
  budgets: BudgetWithProgress[];
  safeToSpend: BudgetResult;
  currency: CurrencyCode;
}

export function computeBudgetsData(
  expenses: DecryptedExpenseRow[],
  income: DecryptedIncomeRow[],
  decryptedBudgets: DecryptedBudgetRow[],
  decryptedActiveGoals: DecryptedActiveGoal[],
  decryptedLoans: DecryptedLoanAmounts[],
  raw: Pick<FinanceRawData, "investmentMonthlyContributions">,
  currency: CurrencyCode,
  now = new Date(),
): BudgetsData {
  const budgets: BudgetWithProgress[] = decryptedBudgets.map((b) => {
    const period = b.period as BudgetPeriod;
    const from = iso(periodStart(period, now));
    const spent = expenses
      .filter((e) => e.spentAt >= from)
      .filter((e) => (b.categoryId ? e.categoryId === b.categoryId : true))
      .reduce((sum, e) => sum + e.amount, 0);
    const utilization = b.amount > 0 ? spent / b.amount : 0;
    return {
      id: b.id,
      categoryId: b.categoryId,
      categoryName: b.categoryName,
      categoryIcon: b.categoryIcon,
      period,
      amount: b.amount,
      currency,
      spent,
      remaining: b.amount - spent,
      utilization,
      status: budgetStatus(utilization),
    };
  });

  const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthExpenses = expenses.filter((e) => e.spentAt >= monthStart);
  const fixedExpenses = monthExpenses
    .filter((e) => e.isRecurring)
    .reduce((s, e) => s + e.amount, 0);
  const spentThisMonth = monthExpenses
    .filter((e) => !e.isRecurring)
    .reduce((s, e) => s + e.amount, 0);
  const monthlyIncome = income
    .filter((r) => r.receivedAt >= monthStart)
    .reduce((s, r) => s + r.amount, 0);
  const goalContributions = decryptedActiveGoals.reduce(
    (s, g) => s + (g.monthlyContribution ?? 0),
    0,
  );
  const loanPayments = decryptedLoans
    .filter((l) => l.remainingAmount > 0)
    .reduce((s, l) => s + l.emi + l.extraEmi, 0);
  const investments = raw.investmentMonthlyContributions.reduce((s, v) => s + v, 0);

  const safeToSpend = computeBudget({
    monthlyIncome,
    fixedExpenses,
    goalContributions,
    loanPayments,
    investments,
    spentThisMonth,
  });

  return { budgets, safeToSpend, currency };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
