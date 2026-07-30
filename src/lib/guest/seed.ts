import type { CurrencyCode } from "@/lib/format";
import type { Transaction } from "@/lib/transactions/types";
import type { CategoryOption, AccountOption } from "@/lib/transactions/reference";
import type { RecurringRuleWithSchedule } from "@/lib/recurring/types";
import type { LoanWithProjection } from "@/lib/loans/types";
import { computeLoanProjection } from "@/lib/finance/loan";

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
const CAT = {
  rent: "d290f1ee-6c54-4b01-90e6-d701748f0851",
  groceries: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  food: "3f333df6-90a4-4fda-8dd3-9485d27cee36",
  fuel: "af6a91e6-f7ef-46c2-8a68-8a70f5b7c9fb",
  entertainment: "0b3e5a2a-2b6a-4b8a-9c1a-7f6a9d3e2c10",
  other: "72a51f9e-4c2a-4a2c-8b8a-1f6a3e9d2c11",
  salary: "5c1e2a3b-4d5e-4f6a-8b7c-9d0e1f2a3b12",
  dividend: "6d2f3a4c-5e6f-4a7b-8c9d-0e1f2a3b4c13",
};

const CATEGORIES: CategoryOption[] = [
  { id: CAT.rent, name: "Rent", kind: "expense", icon: "home" },
  { id: CAT.groceries, name: "Groceries", kind: "expense", icon: "shopping-cart" },
  { id: CAT.food, name: "Food", kind: "expense", icon: "utensils" },
  { id: CAT.fuel, name: "Fuel", kind: "expense", icon: "fuel" },
  { id: CAT.entertainment, name: "Entertainment", kind: "expense", icon: "clapperboard" },
  { id: CAT.other, name: "Other", kind: "expense", icon: "shapes" },
  { id: CAT.salary, name: "Salary", kind: "income", icon: "wallet" },
  { id: CAT.dividend, name: "Dividend", kind: "income", icon: "coins" },
];

const ACCOUNTS: AccountOption[] = [
  { id: "7e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a14", name: "Checking" },
];

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** One month's worth of transaction templates: day-of-month + category + amount. */
const MONTH_TEMPLATE: {
  day: number;
  kind: Transaction["kind"];
  categoryId: string;
  amount: number;
  description: string;
  sourceType?: string;
}[] = [
  { day: 1, kind: "income", categoryId: CAT.salary, amount: 8200, description: "Monthly Salary", sourceType: "salary" },
  { day: 3, kind: "expense", categoryId: CAT.rent, amount: 1600, description: "Rent" },
  { day: 8, kind: "expense", categoryId: CAT.groceries, amount: 620, description: "Whole Foods" },
  { day: 12, kind: "expense", categoryId: CAT.food, amount: 480, description: "Dining out" },
  { day: 15, kind: "expense", categoryId: CAT.fuel, amount: 240, description: "Shell" },
  { day: 18, kind: "expense", categoryId: CAT.entertainment, amount: 210, description: "Netflix + movies" },
  { day: 22, kind: "expense", categoryId: CAT.other, amount: 300, description: "Misc" },
  { day: 27, kind: "income", categoryId: CAT.dividend, amount: 42.1, description: "Dividend — VOO", sourceType: "dividend" },
];

function buildTransactions(): Transaction[] {
  const today = new Date();
  const catById = new Map(CATEGORIES.map((c) => [c.id, c]));
  const out: Transaction[] = [];

  // Last 6 calendar months, oldest first; the current month is clipped to
  // "so far" so it reads as a month genuinely in progress.
  for (let m = 5; m >= 0; m--) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
    for (const tmpl of MONTH_TEMPLATE) {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), tmpl.day);
      if (date > today) continue;
      const category = catById.get(tmpl.categoryId);
      out.push({
        id: `guest-seed-${isoDate(date)}-${tmpl.categoryId}`,
        kind: tmpl.kind,
        amount: tmpl.amount,
        currency: "USD",
        description: tmpl.description,
        categoryId: tmpl.categoryId,
        categoryName: category?.name ?? null,
        categoryIcon: category?.icon ?? null,
        accountId: ACCOUNTS[0].id,
        accountName: ACCOUNTS[0].name,
        date: isoDate(date),
        isRecurring: tmpl.kind === "income" && tmpl.sourceType === "salary",
        frequency: tmpl.kind === "income" && tmpl.sourceType === "salary" ? "monthly" : "one_time",
        sourceType: tmpl.sourceType,
      });
    }
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function buildLoans(): LoanWithProjection[] {
  const now = new Date();
  const startDate = isoDate(new Date(now.getFullYear() - 3, now.getMonth(), 1));

  const home = {
    id: "guest-loan-home",
    name: "Home Loan",
    type: "home" as const,
    principal: 220000,
    interestRate: 6.2,
    emi: 720,
    remainingAmount: 185000,
    remainingMonths: null,
    extraEmi: null,
    currency: "USD" as CurrencyCode,
    startDate,
  };
  const car = {
    id: "guest-loan-car",
    name: "Car Loan",
    type: "car" as const,
    principal: 28000,
    interestRate: 5.4,
    emi: 260,
    remainingAmount: 9800,
    remainingMonths: null,
    extraEmi: null,
    currency: "USD" as CurrencyCode,
    startDate,
  };

  return [home, car].map((l) => ({
    ...l,
    projection: computeLoanProjection({
      remainingAmount: l.remainingAmount,
      interestRate: l.interestRate,
      emi: l.emi,
      extraEmi: l.extraEmi,
      principal: l.principal,
    }),
  }));
}

function buildRecurringRules(): RecurringRuleWithSchedule[] {
  const now = new Date();
  const startDate = isoDate(new Date(now.getFullYear(), now.getMonth() - 6, 3));
  const base = {
    accountId: ACCOUNTS[0].id,
    startDate,
    endDate: null,
    isActive: true,
    note: null,
    nextDate: null,
  };

  return [
    {
      ...base,
      id: "guest-recurring-rent",
      name: "Rent",
      kind: "expense" as const,
      categoryId: CAT.rent,
      categoryName: "Rent",
      categoryIcon: "home",
      amount: 1600,
      currency: "USD",
      frequency: "monthly" as const,
      interval: 1,
      monthlyAmount: 1600,
    },
    {
      ...base,
      id: "guest-recurring-internet",
      name: "Internet",
      kind: "expense" as const,
      categoryId: CAT.other,
      categoryName: "Other",
      categoryIcon: "wifi",
      amount: 55,
      currency: "USD",
      frequency: "monthly" as const,
      interval: 1,
      monthlyAmount: 55,
    },
    {
      ...base,
      id: "guest-recurring-electricity",
      name: "Electricity",
      kind: "expense" as const,
      categoryId: CAT.other,
      categoryName: "Other",
      categoryIcon: "zap",
      amount: 96,
      currency: "USD",
      frequency: "monthly" as const,
      interval: 1,
      monthlyAmount: 96,
    },
  ];
}

export function buildGuestSeed(): GuestSeed {
  return {
    transactions: buildTransactions(),
    categories: CATEGORIES,
    accounts: ACCOUNTS,
    goals: [
      { id: "guest-goal-emergency", name: "Emergency Fund", icon: "shield", saved: 13500, target: 20000, monthlyContribution: 400, status: "active" },
      { id: "guest-goal-car", name: "New Car", icon: "car", saved: 8200, target: 25000, monthlyContribution: 200, status: "active" },
      { id: "guest-goal-trip", name: "Japan Trip", icon: "plane", saved: 2400, target: 6000, monthlyContribution: 100, status: "active" },
    ],
    loans: buildLoans(),
    investments: { totalValue: 210000, monthlyContribution: 1200 },
    recurringRules: buildRecurringRules(),
    budgetLimits: [{ categoryName: "Entertainment", amount: 400 }],
    profile: { name: "Guest", baseCurrency: "USD" },
  };
}

/**
 * Blank starting point for a guest who opts out of sample data. Keeps the
 * category/account reference lists (the transaction form needs options to
 * pick from) but no seeded transactions, goals, loans, investments,
 * recurring rules, or budget limits.
 */
export function buildEmptyGuestSeed(): GuestSeed {
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
