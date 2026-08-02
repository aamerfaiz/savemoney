/**
 * Pure transaction-list computation (Phase 3.5.3) — the flatten/sort logic
 * that used to live in getTransactions(), unchanged, now taking
 * already-decrypted income/expense rows instead of fetching them itself.
 */

import type { CurrencyCode } from "@/lib/format";
import type {
  DecryptedContributionRow,
  DecryptedExpenseRow,
  DecryptedIncomeRow,
} from "@/lib/finance/decrypt";
import type { Transaction, TransactionFilter, TransactionSummary } from "./types";

export function computeTransactionsList(
  income: DecryptedIncomeRow[],
  expenses: DecryptedExpenseRow[],
  contributions: DecryptedContributionRow[],
  filter: TransactionFilter = "all",
): Transaction[] {
  const results: Transaction[] = [];

  if (filter !== "expense") {
    for (const r of income) {
      results.push({
        id: r.id,
        kind: "income",
        amount: r.amount,
        currency: (r.currency as CurrencyCode) ?? "USD",
        description: r.description,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        categoryIcon: r.categoryIcon,
        accountId: r.accountId,
        accountName: r.accountName,
        date: r.receivedAt,
        isRecurring: r.isRecurring,
        frequency: r.frequency,
        sourceType: r.sourceType,
      });
    }
  }

  if (filter !== "income") {
    for (const r of expenses) {
      results.push({
        id: r.id,
        kind: "expense",
        amount: r.amount,
        currency: (r.currency as CurrencyCode) ?? "USD",
        description: r.description,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        categoryIcon: r.categoryIcon,
        accountId: r.accountId,
        accountName: r.accountName,
        date: r.spentAt,
        isRecurring: r.isRecurring,
        frequency: r.frequency,
        note: r.note,
        tags: r.tags,
      });
    }
  }

  if (filter === "all") {
    for (const c of contributions) {
      const goalName = c.goalName ?? "a goal";
      results.push({
        id: `contrib-${c.id}`,
        kind: "transfer",
        amount: c.amount,
        currency: "USD",
        description: `Moved to ${goalName}`,
        categoryId: null,
        categoryName: "Savings",
        categoryIcon: c.goalIcon ?? "piggy-bank",
        accountId: null,
        accountName: null,
        date: c.contributedAt,
        isRecurring: false,
        frequency: "one_time",
        note: c.note,
      });
    }
  }

  results.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return results;
}

export function summarize(
  transactions: Transaction[],
  currency: CurrencyCode = "USD",
): TransactionSummary {
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (t.kind === "income") income += t.amount;
    else if (t.kind === "expense") expenses += t.amount;
  }
  return {
    income,
    expenses,
    net: income - expenses,
    currency,
    count: transactions.length,
  };
}
