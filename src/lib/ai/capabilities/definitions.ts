import "server-only";

import { transactionInputSchema, INCOME_SOURCE_TYPES } from "@/lib/transactions/types";
import { createTransaction } from "@/lib/transactions/actions";

import {
  investmentInputSchema,
  contributionInputSchema as investmentContributionSchema,
  INVESTMENT_TYPES,
} from "@/lib/investments/types";
import { createInvestment, recordContribution } from "@/lib/investments/actions";

import { loanInputSchema, paymentInputSchema, LOAN_TYPES } from "@/lib/loans/types";
import { createLoan, recordPayment } from "@/lib/loans/actions";

import {
  goalInputSchema,
  contributionInputSchema as goalContributionSchema,
  GOAL_PRIORITIES,
  GOAL_ICONS,
} from "@/lib/goals/types";
import { createGoal, addContribution } from "@/lib/goals/actions";

import { budgetInputSchema, BUDGET_PERIODS } from "@/lib/budgets/types";
import { createBudget } from "@/lib/budgets/actions";

import { recurringInputSchema, RECURRING_FREQUENCIES } from "@/lib/recurring/types";
import { createRecurringRule } from "@/lib/recurring/actions";

import type { AICapability } from "./types";
import { matchByName, toFormData } from "./shared";
import {
  asBool,
  asString,
  normalizeDate,
  normalizeEnum,
  todayISO,
  toNumber,
} from "./extract-utils";

/** Every capability Smart Entry can propose. One entry per existing
 * create/log Server Action — see `docs/ai-smart-entry-plan.md`. */
export const CAPABILITY_DEFINITIONS: AICapability[] = [
  {
    key: "transaction.expense",
    module: "transaction",
    label: "Expense",
    requiresTarget: false,
    promptDescription:
      'A single expense already made. args: amount (number, required), date ' +
      "(YYYY-MM-DD, optional, defaults to today), categoryName (string, best " +
      "guess), accountName (string, optional), description (short string, " +
      "optional).",
    schema: transactionInputSchema,
    resolve(args, ref) {
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings: [], error: "Missing or invalid amount." };

      const warnings: string[] = [];
      const categoryGuess = asString(args.categoryName);
      const category = matchByName(categoryGuess, ref.expenseCategories);
      if (categoryGuess && !category) {
        warnings.push(`Couldn't match category "${categoryGuess}" — will save uncategorized.`);
      }
      const accountGuess = asString(args.accountName);
      const account = matchByName(accountGuess, ref.accounts);
      if (accountGuess && !account) {
        warnings.push(`Couldn't match account "${accountGuess}".`);
      }

      const parsed = transactionInputSchema.safeParse({
        kind: "expense",
        amount,
        date: normalizeDate(args.date) ?? todayISO(),
        categoryId: category?.id ?? null,
        accountId: account?.id ?? null,
        description: asString(args.description),
        note: null,
        isRecurring: false,
        frequency: "one_time",
      });
      if (!parsed.success) {
        return { ok: false, warnings, error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return { ok: true, fields: parsed.data, warnings };
    },
    execute: (fields) => createTransaction(undefined, toFormData(fields)),
  },

  {
    key: "transaction.income",
    module: "transaction",
    label: "Income",
    requiresTarget: false,
    promptDescription:
      "A single income already received. args: amount (number, required), date " +
      "(YYYY-MM-DD, optional, defaults to today), sourceType (one of salary/" +
      "freelance/rental/interest/business/dividend/other, optional), " +
      "accountName (string, optional), description (short string, optional).",
    schema: transactionInputSchema,
    resolve(args, ref) {
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings: [], error: "Missing or invalid amount." };

      const warnings: string[] = [];
      const accountGuess = asString(args.accountName);
      const account = matchByName(accountGuess, ref.accounts);
      if (accountGuess && !account) {
        warnings.push(`Couldn't match account "${accountGuess}".`);
      }
      const sourceType = normalizeEnum(args.sourceType, INCOME_SOURCE_TYPES);

      const parsed = transactionInputSchema.safeParse({
        kind: "income",
        amount,
        date: normalizeDate(args.date) ?? todayISO(),
        categoryId: null,
        accountId: account?.id ?? null,
        description: asString(args.description),
        sourceType: sourceType ?? undefined,
        isRecurring: false,
        frequency: "one_time",
      });
      if (!parsed.success) {
        return { ok: false, warnings, error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return { ok: true, fields: parsed.data, warnings };
    },
    execute: (fields) => createTransaction(undefined, toFormData(fields)),
  },

  {
    key: "investment.contribution",
    module: "investment",
    label: "Investment contribution",
    requiresTarget: true,
    promptDescription:
      "Money added to an EXISTING investment holding (a SIP/top-up, not a new " +
      "holding). args: investmentName (string, required — must refer to a " +
      "holding the user already has), amount (number, required), date " +
      "(YYYY-MM-DD, optional, defaults to today).",
    schema: investmentContributionSchema,
    resolve(args, ref) {
      const nameGuess = asString(args.investmentName);
      const investment = matchByName(nameGuess, ref.investments);
      if (!investment) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess
            ? `No investment named "${nameGuess}" found.`
            : "Missing investment name.",
        };
      }
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings: [], error: "Missing or invalid amount." };

      const parsed = investmentContributionSchema.safeParse({
        amount,
        addToValue: true,
        contributedAt: normalizeDate(args.date) ?? todayISO(),
      });
      if (!parsed.success) {
        return { ok: false, warnings: [], error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return {
        ok: true,
        fields: parsed.data,
        targetId: investment.id,
        targetLabel: investment.name,
        warnings: [],
      };
    },
    execute: (fields, targetId) => recordContribution(targetId!, undefined, toFormData(fields)),
  },

  {
    key: "investment.create",
    module: "investment",
    label: "New investment",
    requiresTarget: false,
    promptDescription:
      "A brand-new investment holding the user is starting. args: name " +
      "(string, required), type (one of stocks/mutual_fund/etf/bonds/crypto/" +
      "real_estate/gold/retirement/other, optional), investedAmount (number, " +
      "required), currentValue (number, optional — defaults to investedAmount " +
      "for a fresh holding), monthlyContribution (number, optional), " +
      "expectedReturn (number, percent, optional), startDate (YYYY-MM-DD, " +
      "optional, defaults to today).",
    schema: investmentInputSchema,
    resolve(args) {
      const name = asString(args.name);
      const investedAmount = toNumber(args.investedAmount);
      if (!name || investedAmount == null) {
        return { ok: false, warnings: [], error: "Missing investment name or invested amount." };
      }
      const currentValue = toNumber(args.currentValue) ?? investedAmount;
      const type = normalizeEnum(args.type, INVESTMENT_TYPES);

      const parsed = investmentInputSchema.safeParse({
        name,
        type: type ?? undefined,
        investedAmount,
        currentValue,
        monthlyContribution: toNumber(args.monthlyContribution),
        expectedReturn: toNumber(args.expectedReturn) ?? 0,
        startDate: normalizeDate(args.startDate) ?? todayISO(),
      });
      if (!parsed.success) {
        return { ok: false, warnings: [], error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return { ok: true, fields: parsed.data, warnings: [] };
    },
    execute: (fields) => createInvestment(undefined, toFormData(fields)),
  },

  {
    key: "loan.payment",
    module: "loan",
    label: "Loan payment",
    requiresTarget: true,
    promptDescription:
      "A payment made toward an EXISTING loan (an EMI or extra principal " +
      "payment, not a new loan). args: loanName (string, required — must " +
      "refer to a loan the user already has), amount (number, required), date " +
      "(YYYY-MM-DD, optional, defaults to today), isExtra (boolean, optional — " +
      "true only when the user says this is an extra/additional payment on " +
      "top of the regular EMI).",
    schema: paymentInputSchema,
    resolve(args, ref) {
      const nameGuess = asString(args.loanName);
      const loan = matchByName(nameGuess, ref.loans);
      if (!loan) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess ? `No loan named "${nameGuess}" found.` : "Missing loan name.",
        };
      }
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings: [], error: "Missing or invalid amount." };

      const parsed = paymentInputSchema.safeParse({
        amount,
        paidOn: normalizeDate(args.date) ?? todayISO(),
        isExtra: asBool(args.isExtra) ?? false,
      });
      if (!parsed.success) {
        return { ok: false, warnings: [], error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return {
        ok: true,
        fields: parsed.data,
        targetId: loan.id,
        targetLabel: loan.name,
        warnings: [],
      };
    },
    execute: (fields, targetId) => recordPayment(targetId!, undefined, toFormData(fields)),
  },

  {
    key: "loan.create",
    module: "loan",
    label: "New loan",
    requiresTarget: false,
    promptDescription:
      "A brand-new loan the user has taken on. args: name (string, required), " +
      "type (one of home/car/personal/education/credit_card/other, optional), " +
      "principal (number, required), interestRate (number, percent, required), " +
      "emi (number, required), remainingAmount (number, optional — defaults to " +
      "principal for a brand-new loan), startDate (YYYY-MM-DD, optional, " +
      "defaults to today).",
    schema: loanInputSchema,
    resolve(args) {
      const name = asString(args.name);
      const principal = toNumber(args.principal);
      const interestRate = toNumber(args.interestRate);
      const emi = toNumber(args.emi);
      if (!name || principal == null || interestRate == null || emi == null) {
        return { ok: false, warnings: [], error: "Missing loan name, principal, interest rate, or EMI." };
      }
      const type = normalizeEnum(args.type, LOAN_TYPES);

      const parsed = loanInputSchema.safeParse({
        name,
        type: type ?? undefined,
        principal,
        interestRate,
        emi,
        remainingAmount: toNumber(args.remainingAmount) ?? principal,
        startDate: normalizeDate(args.startDate) ?? todayISO(),
      });
      if (!parsed.success) {
        return { ok: false, warnings: [], error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return { ok: true, fields: parsed.data, warnings: [] };
    },
    execute: (fields) => createLoan(undefined, toFormData(fields)),
  },

  {
    key: "goal.contribution",
    module: "goal",
    label: "Goal contribution",
    requiresTarget: true,
    promptDescription:
      "Money added toward an EXISTING savings goal. args: goalName (string, " +
      "required — must refer to a goal the user already has), amount (number, " +
      "required), date (YYYY-MM-DD, optional, defaults to today).",
    schema: goalContributionSchema,
    resolve(args, ref) {
      const nameGuess = asString(args.goalName);
      const goal = matchByName(nameGuess, ref.goals);
      if (!goal) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess ? `No goal named "${nameGuess}" found.` : "Missing goal name.",
        };
      }
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings: [], error: "Missing or invalid amount." };

      const parsed = goalContributionSchema.safeParse({
        amount,
        contributedAt: normalizeDate(args.date) ?? todayISO(),
        note: null,
      });
      if (!parsed.success) {
        return { ok: false, warnings: [], error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return {
        ok: true,
        fields: parsed.data,
        targetId: goal.id,
        targetLabel: goal.name,
        warnings: [],
      };
    },
    execute: (fields, targetId) => addContribution(targetId!, undefined, toFormData(fields)),
  },

  {
    key: "goal.create",
    module: "goal",
    label: "New goal",
    requiresTarget: false,
    promptDescription:
      "A brand-new savings goal. args: name (string, required), targetAmount " +
      "(number, required), currentAmount (number, optional, defaults to 0), " +
      "deadline (YYYY-MM-DD, optional), priority (one of low/medium/high, " +
      "optional), monthlyContribution (number, optional).",
    schema: goalInputSchema,
    resolve(args) {
      const name = asString(args.name);
      const targetAmount = toNumber(args.targetAmount);
      if (!name || targetAmount == null) {
        return { ok: false, warnings: [], error: "Missing goal name or target amount." };
      }
      const priority = normalizeEnum(args.priority, GOAL_PRIORITIES);
      const icon = normalizeEnum(args.icon, GOAL_ICONS);

      const parsed = goalInputSchema.safeParse({
        name,
        icon: icon ?? null,
        targetAmount,
        currentAmount: toNumber(args.currentAmount) ?? 0,
        deadline: normalizeDate(args.deadline),
        priority: priority ?? undefined,
        monthlyContribution: toNumber(args.monthlyContribution),
      });
      if (!parsed.success) {
        return { ok: false, warnings: [], error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return { ok: true, fields: parsed.data, warnings: [] };
    },
    execute: (fields) => createGoal(undefined, toFormData(fields)),
  },

  {
    key: "budget.create",
    module: "budget",
    label: "New budget",
    requiresTarget: false,
    promptDescription:
      "A new spending budget/limit. args: categoryName (string, optional — " +
      "omit for an overall/all-spending budget), period (one of weekly/" +
      "monthly/yearly, optional, defaults to monthly), amount (number, " +
      "required), startsOn (YYYY-MM-DD, optional, defaults to today).",
    schema: budgetInputSchema,
    resolve(args, ref) {
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings: [], error: "Missing or invalid amount." };

      const warnings: string[] = [];
      const categoryGuess = asString(args.categoryName);
      const category = matchByName(categoryGuess, ref.expenseCategories);
      if (categoryGuess && !category) {
        warnings.push(`Couldn't match category "${categoryGuess}" — will save as an overall budget.`);
      }
      const period = normalizeEnum(args.period, BUDGET_PERIODS);

      const parsed = budgetInputSchema.safeParse({
        categoryId: category?.id ?? null,
        period: period ?? undefined,
        amount,
        startsOn: normalizeDate(args.startsOn) ?? todayISO(),
      });
      if (!parsed.success) {
        return { ok: false, warnings, error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return { ok: true, fields: parsed.data, warnings };
    },
    execute: (fields) => createBudget(undefined, toFormData(fields)),
  },

  {
    key: "recurring.create",
    module: "recurring",
    label: "New recurring rule",
    requiresTarget: false,
    promptDescription:
      "A new recurring income or expense rule (a subscription, rent, salary, " +
      "etc.). args: name (string, required), kind (income or expense, " +
      "optional, defaults to expense), categoryName (string, optional), " +
      "accountName (string, optional), amount (number, required), frequency " +
      "(one of daily/weekly/monthly/quarterly/yearly, optional, defaults to " +
      "monthly), startDate (YYYY-MM-DD, optional, defaults to today).",
    schema: recurringInputSchema,
    resolve(args, ref) {
      const name = asString(args.name);
      const amount = toNumber(args.amount);
      if (!name || amount == null) {
        return { ok: false, warnings: [], error: "Missing rule name or amount." };
      }

      const warnings: string[] = [];
      const kind = normalizeEnum(args.kind, ["income", "expense"] as const) ?? "expense";
      const categoryPool = kind === "income" ? ref.incomeCategories : ref.expenseCategories;
      const categoryGuess = asString(args.categoryName);
      const category = matchByName(categoryGuess, categoryPool);
      if (categoryGuess && !category) {
        warnings.push(`Couldn't match category "${categoryGuess}" — will save uncategorized.`);
      }
      const accountGuess = asString(args.accountName);
      const account = matchByName(accountGuess, ref.accounts);
      if (accountGuess && !account) {
        warnings.push(`Couldn't match account "${accountGuess}".`);
      }
      const frequency = normalizeEnum(args.frequency, RECURRING_FREQUENCIES);

      const parsed = recurringInputSchema.safeParse({
        name,
        kind,
        categoryId: category?.id ?? null,
        accountId: account?.id ?? null,
        amount,
        frequency: frequency ?? undefined,
        startDate: normalizeDate(args.startDate) ?? todayISO(),
        endDate: normalizeDate(args.endDate),
        isActive: true,
        note: asString(args.note),
      });
      if (!parsed.success) {
        return { ok: false, warnings, error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return { ok: true, fields: parsed.data, warnings };
    },
    execute: (fields) => createRecurringRule(undefined, toFormData(fields)),
  },
];
