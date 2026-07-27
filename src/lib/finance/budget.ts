/**
 * Dynamic budgeting engine (pure).
 *
 *   Safe-to-Spend = Income − Fixed Expenses − Investments
 *                   − Loan Payments − Savings Goal contributions
 *
 * The result is then sliced into daily / weekly / monthly views and combined
 * with month-to-date spend to produce a remaining figure and utilisation.
 */

export interface BudgetInputs {
  monthlyIncome: number;
  fixedExpenses: number;
  investments: number;
  loanPayments: number;
  goalContributions: number;
  /** Discretionary amount already spent so far this month. */
  spentThisMonth: number;
  /** Days in the current month (defaults to 30). */
  daysInMonth?: number;
  /** Day of month today (1-based, defaults to now). */
  today?: number;
}

export interface BudgetResult {
  safeToSpendMonthly: number;
  dailyBudget: number;
  weeklyBudget: number;
  remaining: number;
  /** 0–1 share of the safe amount already used. */
  utilization: number;
  /** What you can still spend per remaining day without overshooting. */
  perRemainingDay: number;
  overspent: boolean;
}

export function computeBudget(input: BudgetInputs): BudgetResult {
  const now = new Date();
  const daysInMonth =
    input.daysInMonth ??
    new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = input.today ?? now.getDate();

  const safeToSpendMonthly = Math.max(
    0,
    input.monthlyIncome -
      input.fixedExpenses -
      input.investments -
      input.loanPayments -
      input.goalContributions,
  );

  const dailyBudget = safeToSpendMonthly / daysInMonth;
  const weeklyBudget = dailyBudget * 7;
  const remaining = safeToSpendMonthly - input.spentThisMonth;
  const utilization =
    safeToSpendMonthly > 0
      ? Math.min(1.5, input.spentThisMonth / safeToSpendMonthly)
      : input.spentThisMonth > 0
        ? 1.5
        : 0;
  const daysLeft = Math.max(1, daysInMonth - today + 1);

  return {
    safeToSpendMonthly,
    dailyBudget,
    weeklyBudget,
    remaining,
    utilization,
    perRemainingDay: remaining / daysLeft,
    overspent: remaining < 0,
  };
}
