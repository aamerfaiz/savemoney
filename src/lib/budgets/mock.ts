import { computeBudget, type BudgetResult } from "@/lib/finance/budget";
import { budgetStatus, type BudgetWithProgress } from "./types";

/** Demo budgets so the page renders without a configured backend. */
export const demoBudgets: BudgetWithProgress[] = [
  mk("Overall", null, "target", "monthly", 3500, 2130),
  mk("Groceries", "demo", "shopping-cart", "monthly", 700, 620),
  mk("Food", "demo", "utensils", "monthly", 500, 480),
  mk("Entertainment", "demo", "clapperboard", "monthly", 400, 210),
  mk("Fuel", "demo", "fuel", "monthly", 300, 240),
  mk("Shopping", "demo", "shopping-bag", "monthly", 250, 305),
];

export const demoSafeToSpend: BudgetResult = computeBudget({
  monthlyIncome: 8200,
  fixedExpenses: 2450,
  investments: 1200,
  loanPayments: 980,
  goalContributions: 700,
  spentThisMonth: 2130,
});

function mk(
  categoryName: string,
  categoryId: string | null,
  categoryIcon: string,
  period: BudgetWithProgress["period"],
  amount: number,
  spent: number,
): BudgetWithProgress {
  const utilization = amount > 0 ? spent / amount : 0;
  return {
    id: `demo-${categoryName}`,
    categoryId,
    categoryName,
    categoryIcon,
    period,
    amount,
    currency: "USD",
    spent,
    remaining: amount - spent,
    utilization,
    status: budgetStatus(utilization),
  };
}
