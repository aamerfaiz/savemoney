import type { CurrencyCode } from "@/lib/format";
import type { Transaction } from "@/lib/transactions/types";
import type { CategoryOption, AccountOption } from "@/lib/transactions/reference";
import type { RecurringRuleWithSchedule } from "@/lib/recurring/types";
import type { LoanWithProjection } from "@/lib/loans/types";

export interface GuestGoal {
  id: string;
  name: string;
  icon: string;
  saved: number;
  target: number;
  monthlyContribution: number;
  status: "active" | "completed";
}

export interface GuestInvestments {
  totalValue: number;
  monthlyContribution: number;
}

export interface GuestBudgetLimit {
  categoryName: string;
  amount: number;
}

export interface GuestProfile {
  name: string;
  baseCurrency: CurrencyCode;
}

export interface GuestSeed {
  transactions: Transaction[];
  categories: CategoryOption[];
  accounts: AccountOption[];
  goals: GuestGoal[];
  loans: LoanWithProjection[];
  investments: GuestInvestments;
  recurringRules: RecurringRuleWithSchedule[];
  budgetLimits: GuestBudgetLimit[];
  profile: GuestProfile;
}

// transactionInputSchema validates categoryId/accountId as z.string().uuid()
// (it's shared with the real Supabase-backed schema, where these are uuid
// columns) — so guest reference data needs real UUIDs too, not readable slugs.
const CATEGORIES: CategoryOption[] = [
  { id: "d290f1ee-6c54-4b01-90e6-d701748f0851", name: "Rent", kind: "expense", icon: "home" },
  { id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", name: "Groceries", kind: "expense", icon: "shopping-cart" },
  { id: "3f333df6-90a4-4fda-8dd3-9485d27cee36", name: "Food", kind: "expense", icon: "utensils" },
  { id: "af6a91e6-f7ef-46c2-8a68-8a70f5b7c9fb", name: "Fuel", kind: "expense", icon: "fuel" },
  { id: "0b3e5a2a-2b6a-4b8a-9c1a-7f6a9d3e2c10", name: "Entertainment", kind: "expense", icon: "clapperboard" },
  { id: "72a51f9e-4c2a-4a2c-8b8a-1f6a3e9d2c11", name: "Other", kind: "expense", icon: "shapes" },
  { id: "5c1e2a3b-4d5e-4f6a-8b7c-9d0e1f2a3b12", name: "Salary", kind: "income", icon: "wallet" },
  { id: "6d2f3a4c-5e6f-4a7b-8c9d-0e1f2a3b4c13", name: "Dividend", kind: "income", icon: "coins" },
];

const ACCOUNTS: AccountOption[] = [
  { id: "7e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a14", name: "Checking" },
];

/**
 * Blank starting point for a new guest session. Keeps the category/account
 * reference lists (the transaction form needs options to pick from) but no
 * seeded transactions, goals, loans, investments, recurring rules, or budget
 * limits — a guest's data is only what they enter themselves.
 */
export function buildGuestSeed(): GuestSeed {
  return {
    transactions: [],
    categories: CATEGORIES,
    accounts: ACCOUNTS,
    goals: [],
    loans: [],
    investments: { totalValue: 0, monthlyContribution: 0 },
    recurringRules: [],
    budgetLimits: [],
    profile: { name: "Guest", baseCurrency: "USD" },
  };
}
