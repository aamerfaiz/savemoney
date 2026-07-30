import { getGuestTable, setGuestTable } from "./db";
import {
  buildGuestSeed,
  buildEmptyGuestSeed,
  type GuestGoal,
  type GuestInvestments,
  type GuestBudgetLimit,
  type GuestProfile,
} from "./seed";
import type { Transaction } from "@/lib/transactions/types";
import type { CategoryOption, AccountOption } from "@/lib/transactions/reference";
import type { RecurringRuleWithSchedule } from "@/lib/recurring/types";
import type { LoanWithProjection } from "@/lib/loans/types";

export interface GuestData {
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

/**
 * Seeds IndexedDB once, on first guest login. A no-op afterwards.
 * `useSampleData` (default true, matching prior behavior) picks demo
 * transactions/goals/loans/etc. vs. a blank slate with just the
 * category/account reference lists.
 */
export async function ensureGuestSeeded(useSampleData = true): Promise<void> {
  const seeded = await getGuestTable<boolean>("seeded");
  if (seeded) return;

  const seed = useSampleData ? buildGuestSeed() : buildEmptyGuestSeed();
  await Promise.all([
    setGuestTable("transactions", seed.transactions),
    setGuestTable("categories", seed.categories),
    setGuestTable("accounts", seed.accounts),
    setGuestTable("goals", seed.goals),
    setGuestTable("loans", seed.loans),
    setGuestTable("investments", seed.investments),
    setGuestTable("recurringRules", seed.recurringRules),
    setGuestTable("budgetLimits", seed.budgetLimits),
    setGuestTable("profile", seed.profile),
  ]);
  await setGuestTable("seeded", true);
}

export async function loadGuestData(): Promise<GuestData> {
  await ensureGuestSeeded();
  const [
    transactions,
    categories,
    accounts,
    goals,
    loans,
    investments,
    recurringRules,
    budgetLimits,
    profile,
  ] = await Promise.all([
    getGuestTable<Transaction[]>("transactions"),
    getGuestTable<CategoryOption[]>("categories"),
    getGuestTable<AccountOption[]>("accounts"),
    getGuestTable<GuestGoal[]>("goals"),
    getGuestTable<LoanWithProjection[]>("loans"),
    getGuestTable<GuestInvestments>("investments"),
    getGuestTable<RecurringRuleWithSchedule[]>("recurringRules"),
    getGuestTable<GuestBudgetLimit[]>("budgetLimits"),
    getGuestTable<GuestProfile>("profile"),
  ]);

  return {
    transactions: transactions ?? [],
    categories: categories ?? [],
    accounts: accounts ?? [],
    goals: goals ?? [],
    loans: loans ?? [],
    investments: investments ?? { totalValue: 0, monthlyContribution: 0 },
    recurringRules: recurringRules ?? [],
    budgetLimits: budgetLimits ?? [],
    profile: profile ?? { name: "Guest", baseCurrency: "USD" },
  };
}
