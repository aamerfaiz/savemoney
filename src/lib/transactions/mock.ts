import type { Transaction } from "./types";

/** Demo transactions so the page renders without a configured backend. */
export const demoTransactions: Transaction[] = [
  mk("Whole Foods", "expense", 84.2, "Groceries", "shopping-cart", 0),
  mk("Monthly Salary", "income", 8200, "Salary", "wallet", 1, "salary"),
  mk("Netflix", "expense", 15.99, "Entertainment", "clapperboard", 2),
  mk("Shell", "expense", 52.4, "Fuel", "fuel", 2),
  mk("Dividend — VOO", "income", 42.1, "Dividend", "coins", 3, "dividend"),
  mk("Dinner — Nobu", "expense", 128, "Food", "utensils", 4),
  mk("Moved to Emergency Fund", "transfer", 300, "Savings", "piggy-bank", 4),
  mk("Rent", "expense", 1600, "Rent", "home", 5),
  mk("Freelance — logo", "income", 450, "Freelance", "laptop", 6, "freelance"),
];

function mk(
  description: string,
  kind: Transaction["kind"],
  amount: number,
  categoryName: string,
  categoryIcon: string,
  daysAgo: number,
  sourceType?: string,
): Transaction {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `demo-${description}-${daysAgo}`,
    kind,
    amount,
    currency: "USD",
    description,
    categoryId: null,
    categoryName,
    categoryIcon,
    accountId: null,
    accountName: null,
    date: d.toISOString().slice(0, 10),
    isRecurring: kind === "income" && sourceType === "salary",
    frequency: kind === "income" && sourceType === "salary" ? "monthly" : "one_time",
    sourceType,
  };
}
