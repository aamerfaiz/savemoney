import "server-only";

import { z } from "zod";

import {
  investmentInputSchema,
  contributionInputSchema as investmentContributionSchema,
  INVESTMENT_TYPES,
} from "@/lib/investments/types";
import {
  createInvestment,
  recordContribution,
  updateInvestment,
  deleteInvestment,
} from "@/lib/investments/actions";

import { loanInputSchema, paymentInputSchema, LOAN_TYPES } from "@/lib/loans/types";
import { createLoan, recordPayment, updateLoan, deleteLoan } from "@/lib/loans/actions";

import {
  goalInputSchema,
  contributionInputSchema as goalContributionSchema,
  GOAL_PRIORITIES,
  GOAL_ICONS,
} from "@/lib/goals/types";
import { createGoal, addContribution, updateGoal, deleteGoal } from "@/lib/goals/actions";

import { deleteBudget } from "@/lib/budgets/actions";

import { recurringInputSchema, RECURRING_FREQUENCIES } from "@/lib/recurring/types";
import {
  createRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
} from "@/lib/recurring/actions";

import type { AICapability } from "./types";
import {
  matchByName,
  toFormData,
  fetchCurrentInvestment,
  fetchCurrentLoan,
  fetchCurrentGoal,
  fetchCurrentRecurring,
} from "./shared";
import {
  asBool,
  asString,
  normalizeDate,
  normalizeEnum,
  todayISO,
  toNumber,
} from "./extract-utils";

/** Trivial schema for delete capabilities — nothing to validate. */
const emptySchema = z.object({});

/**
 * Every capability Smart Entry can propose. One entry per existing
 * create/log/update/delete Server Action — see `docs/ai-smart-entry-plan.md`.
 *
 * No `transaction.*` capabilities as of Phase 3.5.3, and no `budget.create`/
 * `budget.edit` as of Phase 3.5.4 (removed, not disabled): once a table's
 * `amount` is encrypted under the vault DEK, this file's `execute()` calls
 * — which run entirely server-side via /api/v1/ai/commit — have no DEK to
 * encrypt with. Properly supporting them would mean moving amount
 * validation client-side (before encryption) while commit.ts's independent
 * re-validation (`def.schema.safeParse`, the "never trust fields"
 * defense-in-depth check) can no longer inspect a real numeric amount
 * post-encryption — a real redesign of that trust boundary, not done here.
 * Creating/editing a budget still works normally through the Budget page
 * itself (src/lib/budgets/client-actions.ts), which encrypts client-side
 * the same way. `budget.delete` is unaffected (no amount involved) and
 * stays. Only the natural-language Smart Entry shortcut is unavailable for
 * creating/editing transactions and budgets.
 */
export const CAPABILITY_DEFINITIONS: AICapability[] = [
  {
    key: "investment.contribution",
    module: "investment",
    label: "Investment contribution",
    requiresTarget: true,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "Money added to an EXISTING investment holding (a SIP/top-up, not a new " +
      "holding). args: investmentName (string, required — must refer to a " +
      "holding the user already has), amount (number, required), date " +
      "(YYYY-MM-DD, optional, defaults to today).",
    schema: investmentContributionSchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.investmentName);
      const investment = matchByName(nameGuess, ref.investments);
      const warnings: string[] = [];
      if (!investment) {
        warnings.push(
          nameGuess
            ? `Couldn't match investment "${nameGuess}" — pick one below.`
            : "No investment specified — pick one below.",
        );
      }
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings, error: "Missing or invalid amount." };

      const parsed = investmentContributionSchema.safeParse({
        amount,
        addToValue: true,
        contributedAt: normalizeDate(args.date) ?? todayISO(),
      });
      if (!parsed.success) {
        return { ok: false, warnings, error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      // Unresolved: still a valid draft, just missing a target — the UI
      // shows a picker (never a guessed id) and commit re-requires it.
      return {
        ok: true,
        fields: parsed.data,
        targetId: investment?.id,
        targetLabel: investment?.name,
        warnings,
      };
    },
    execute: (fields, targetId) => recordContribution(targetId!, undefined, toFormData(fields)),
  },

  {
    key: "investment.create",
    module: "investment",
    label: "New investment",
    requiresTarget: false,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "A brand-new investment holding the user is starting. args: name " +
      "(string, required), type (one of stocks/mutual_fund/etf/bonds/crypto/" +
      "real_estate/gold/retirement/other, optional), investedAmount (number, " +
      "required), currentValue (number, optional — defaults to investedAmount " +
      "for a fresh holding), monthlyContribution (number, optional), " +
      "expectedReturn (number, percent, optional), startDate (YYYY-MM-DD, " +
      "optional, defaults to today).",
    schema: investmentInputSchema,
    async resolve(args) {
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
    key: "investment.edit",
    module: "investment",
    label: "Edit investment",
    requiresTarget: true,
    destructive: false,
    actionLabel: "Save",
    promptDescription:
      "Change details of an EXISTING investment holding. args: investmentName " +
      "(string, required — must refer to a holding the user already has), " +
      "plus ONLY the fields the user wants changed: name, type, " +
      "investedAmount, currentValue, monthlyContribution, expectedReturn, " +
      "startDate.",
    schema: investmentInputSchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.investmentName);
      const match = matchByName(nameGuess, ref.investments);
      if (!match) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess ? `Couldn't find an investment named "${nameGuess}".` : "Missing investment name.",
        };
      }
      const current = await fetchCurrentInvestment(match.id);
      if (!current) return { ok: false, warnings: [], error: "That investment could not be found." };

      const type = normalizeEnum(args.type, INVESTMENT_TYPES);
      const parsed = investmentInputSchema.safeParse({
        name: asString(args.name) ?? current.name,
        type: type ?? current.type,
        investedAmount: toNumber(args.investedAmount) ?? current.investedAmount,
        currentValue: toNumber(args.currentValue) ?? current.currentValue,
        monthlyContribution:
          args.monthlyContribution !== undefined ? toNumber(args.monthlyContribution) : current.monthlyContribution,
        expectedReturn: toNumber(args.expectedReturn) ?? current.expectedReturn,
        startDate: normalizeDate(args.startDate) ?? current.startDate,
      });
      if (!parsed.success) {
        return { ok: false, warnings: [], error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return { ok: true, fields: parsed.data, targetId: match.id, targetLabel: match.name, warnings: [] };
    },
    execute: (fields, targetId) => updateInvestment(targetId!, undefined, toFormData(fields)),
  },

  {
    key: "investment.delete",
    module: "investment",
    label: "Delete investment",
    requiresTarget: true,
    destructive: true,
    actionLabel: "Delete",
    promptDescription:
      "Remove an EXISTING investment holding entirely. args: investmentName " +
      "(string, required — must refer to a holding the user already has).",
    schema: emptySchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.investmentName);
      const match = matchByName(nameGuess, ref.investments);
      if (!match) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess ? `Couldn't find an investment named "${nameGuess}".` : "Missing investment name.",
        };
      }
      return { ok: true, fields: {}, targetId: match.id, targetLabel: match.name, warnings: [] };
    },
    execute: (_fields, targetId) => deleteInvestment(targetId!),
  },

  {
    key: "loan.payment",
    module: "loan",
    label: "Loan payment",
    requiresTarget: true,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "A payment made toward an EXISTING loan (an EMI or extra principal " +
      "payment, not a new loan). args: loanName (string, required — must " +
      "refer to a loan the user already has), amount (number, required), date " +
      "(YYYY-MM-DD, optional, defaults to today), isExtra (boolean, optional — " +
      "true only when the user says this is an extra/additional payment on " +
      "top of the regular EMI).",
    schema: paymentInputSchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.loanName);
      const loan = matchByName(nameGuess, ref.loans);
      const warnings: string[] = [];
      if (!loan) {
        warnings.push(
          nameGuess ? `Couldn't match loan "${nameGuess}" — pick one below.` : "No loan specified — pick one below.",
        );
      }
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings, error: "Missing or invalid amount." };

      const parsed = paymentInputSchema.safeParse({
        amount,
        paidOn: normalizeDate(args.date) ?? todayISO(),
        isExtra: asBool(args.isExtra) ?? false,
      });
      if (!parsed.success) {
        return { ok: false, warnings, error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return {
        ok: true,
        fields: parsed.data,
        targetId: loan?.id,
        targetLabel: loan?.name,
        warnings,
      };
    },
    execute: (fields, targetId) => recordPayment(targetId!, undefined, toFormData(fields)),
  },

  {
    key: "loan.create",
    module: "loan",
    label: "New loan",
    requiresTarget: false,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "A brand-new loan the user has taken on. args: name (string, required), " +
      "type (one of home/car/personal/education/credit_card/other, optional), " +
      "principal (number, required), interestRate (number, percent, required), " +
      "emi (number, required), remainingAmount (number, optional — defaults to " +
      "principal for a brand-new loan), startDate (YYYY-MM-DD, optional, " +
      "defaults to today).",
    schema: loanInputSchema,
    async resolve(args) {
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
    key: "loan.edit",
    module: "loan",
    label: "Edit loan",
    requiresTarget: true,
    destructive: false,
    actionLabel: "Save",
    promptDescription:
      "Change details of an EXISTING loan. args: loanName (string, required — " +
      "must refer to a loan the user already has), plus ONLY the fields the " +
      "user wants changed: name, type, principal, interestRate, emi, " +
      "remainingAmount, startDate.",
    schema: loanInputSchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.loanName);
      const match = matchByName(nameGuess, ref.loans);
      if (!match) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess ? `Couldn't find a loan named "${nameGuess}".` : "Missing loan name.",
        };
      }
      const current = await fetchCurrentLoan(match.id);
      if (!current) return { ok: false, warnings: [], error: "That loan could not be found." };

      const type = normalizeEnum(args.type, LOAN_TYPES);
      const parsed = loanInputSchema.safeParse({
        name: asString(args.name) ?? current.name,
        type: type ?? current.type,
        principal: toNumber(args.principal) ?? current.principal,
        interestRate: toNumber(args.interestRate) ?? current.interestRate,
        emi: toNumber(args.emi) ?? current.emi,
        remainingAmount: toNumber(args.remainingAmount) ?? current.remainingAmount,
        remainingMonths: current.remainingMonths,
        extraEmi: current.extraEmi,
        startDate: normalizeDate(args.startDate) ?? current.startDate,
      });
      if (!parsed.success) {
        return { ok: false, warnings: [], error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return { ok: true, fields: parsed.data, targetId: match.id, targetLabel: match.name, warnings: [] };
    },
    execute: (fields, targetId) => updateLoan(targetId!, undefined, toFormData(fields)),
  },

  {
    key: "loan.delete",
    module: "loan",
    label: "Delete loan",
    requiresTarget: true,
    destructive: true,
    actionLabel: "Delete",
    promptDescription:
      "Remove an EXISTING loan entirely. args: loanName (string, required — " +
      "must refer to a loan the user already has).",
    schema: emptySchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.loanName);
      const match = matchByName(nameGuess, ref.loans);
      if (!match) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess ? `Couldn't find a loan named "${nameGuess}".` : "Missing loan name.",
        };
      }
      return { ok: true, fields: {}, targetId: match.id, targetLabel: match.name, warnings: [] };
    },
    execute: (_fields, targetId) => deleteLoan(targetId!),
  },

  {
    key: "goal.contribution",
    module: "goal",
    label: "Goal contribution",
    requiresTarget: true,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "Money added toward an EXISTING savings goal. args: goalName (string, " +
      "required — must refer to a goal the user already has), amount (number, " +
      "required), date (YYYY-MM-DD, optional, defaults to today).",
    schema: goalContributionSchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.goalName);
      const goal = matchByName(nameGuess, ref.goals);
      const warnings: string[] = [];
      if (!goal) {
        warnings.push(
          nameGuess ? `Couldn't match goal "${nameGuess}" — pick one below.` : "No goal specified — pick one below.",
        );
      }
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings, error: "Missing or invalid amount." };

      const parsed = goalContributionSchema.safeParse({
        amount,
        contributedAt: normalizeDate(args.date) ?? todayISO(),
        note: null,
      });
      if (!parsed.success) {
        return { ok: false, warnings, error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return {
        ok: true,
        fields: parsed.data,
        targetId: goal?.id,
        targetLabel: goal?.name,
        warnings,
      };
    },
    execute: (fields, targetId) => addContribution(targetId!, undefined, toFormData(fields)),
  },

  {
    key: "goal.create",
    module: "goal",
    label: "New goal",
    requiresTarget: false,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "A brand-new savings goal. args: name (string, required), targetAmount " +
      "(number, required), currentAmount (number, optional, defaults to 0), " +
      "deadline (YYYY-MM-DD, optional), priority (one of low/medium/high, " +
      "optional), monthlyContribution (number, optional).",
    schema: goalInputSchema,
    async resolve(args) {
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
    key: "goal.edit",
    module: "goal",
    label: "Edit goal",
    requiresTarget: true,
    destructive: false,
    actionLabel: "Save",
    promptDescription:
      "Change details of an EXISTING savings goal. args: goalName (string, " +
      "required — must refer to a goal the user already has), plus ONLY the " +
      "fields the user wants changed: name, targetAmount, currentAmount, " +
      "deadline, priority, monthlyContribution.",
    schema: goalInputSchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.goalName);
      const match = matchByName(nameGuess, ref.goals);
      if (!match) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess ? `Couldn't find a goal named "${nameGuess}".` : "Missing goal name.",
        };
      }
      const current = await fetchCurrentGoal(match.id);
      if (!current) return { ok: false, warnings: [], error: "That goal could not be found." };

      const priority = normalizeEnum(args.priority, GOAL_PRIORITIES);
      const icon = normalizeEnum(args.icon, GOAL_ICONS);
      const parsed = goalInputSchema.safeParse({
        name: asString(args.name) ?? current.name,
        icon: icon ?? current.icon,
        targetAmount: toNumber(args.targetAmount) ?? current.targetAmount,
        currentAmount: toNumber(args.currentAmount) ?? current.currentAmount,
        deadline: normalizeDate(args.deadline) ?? current.deadline,
        priority: priority ?? current.priority,
        monthlyContribution:
          args.monthlyContribution !== undefined ? toNumber(args.monthlyContribution) : current.monthlyContribution,
      });
      if (!parsed.success) {
        return { ok: false, warnings: [], error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return { ok: true, fields: parsed.data, targetId: match.id, targetLabel: match.name, warnings: [] };
    },
    execute: (fields, targetId) => updateGoal(targetId!, undefined, toFormData(fields)),
  },

  {
    key: "goal.delete",
    module: "goal",
    label: "Delete goal",
    requiresTarget: true,
    destructive: true,
    actionLabel: "Delete",
    promptDescription:
      "Remove an EXISTING savings goal entirely. args: goalName (string, " +
      "required — must refer to a goal the user already has).",
    schema: emptySchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.goalName);
      const match = matchByName(nameGuess, ref.goals);
      if (!match) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess ? `Couldn't find a goal named "${nameGuess}".` : "Missing goal name.",
        };
      }
      return { ok: true, fields: {}, targetId: match.id, targetLabel: match.name, warnings: [] };
    },
    execute: (_fields, targetId) => deleteGoal(targetId!),
  },

  {
    key: "budget.delete",
    module: "budget",
    label: "Delete budget",
    requiresTarget: true,
    destructive: true,
    actionLabel: "Delete",
    promptDescription:
      "Remove an EXISTING budget entirely. args: budgetName (string, required " +
      "— describe it, e.g. the category name and/or period).",
    schema: emptySchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.budgetName);
      const match = matchByName(nameGuess, ref.budgets);
      if (!match) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess ? `Couldn't find a budget matching "${nameGuess}".` : "Missing which budget to delete.",
        };
      }
      return { ok: true, fields: {}, targetId: match.id, targetLabel: match.name, warnings: [] };
    },
    execute: (_fields, targetId) => deleteBudget(targetId!),
  },

  {
    key: "recurring.create",
    module: "recurring",
    label: "New recurring rule",
    requiresTarget: false,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "A new recurring income or expense rule (a subscription, rent, salary, " +
      "etc.). args: name (string, required), kind (income or expense, " +
      "optional, defaults to expense), categoryName (string, optional), " +
      "accountName (string, optional), amount (number, required), frequency " +
      "(one of daily/weekly/monthly/quarterly/yearly, optional, defaults to " +
      "monthly), startDate (YYYY-MM-DD, optional, defaults to today).",
    schema: recurringInputSchema,
    async resolve(args, ref) {
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

  {
    key: "recurring.edit",
    module: "recurring",
    label: "Edit recurring rule",
    requiresTarget: true,
    destructive: false,
    actionLabel: "Save",
    promptDescription:
      "Change an EXISTING recurring income/expense rule. args: ruleName " +
      "(string, required — must refer to a rule the user already has), plus " +
      "ONLY the fields the user wants changed: name, categoryName, " +
      "accountName, amount, frequency, startDate, endDate, note.",
    schema: recurringInputSchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.ruleName);
      const match = matchByName(nameGuess, ref.recurringRules);
      if (!match) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess ? `Couldn't find a recurring rule named "${nameGuess}".` : "Missing rule name.",
        };
      }
      const current = await fetchCurrentRecurring(match.id);
      if (!current) return { ok: false, warnings: [], error: "That recurring rule could not be found." };

      const warnings: string[] = [];
      const categoryPool = current.kind === "income" ? ref.incomeCategories : ref.expenseCategories;
      const categoryGuess = asString(args.categoryName);
      const category = categoryGuess ? matchByName(categoryGuess, categoryPool) : undefined;
      if (categoryGuess && !category) {
        warnings.push(`Couldn't match category "${categoryGuess}" — left as-is.`);
      }
      const accountGuess = asString(args.accountName);
      const account = accountGuess ? matchByName(accountGuess, ref.accounts) : undefined;
      if (accountGuess && !account) {
        warnings.push(`Couldn't match account "${accountGuess}" — left as-is.`);
      }
      const frequency = normalizeEnum(args.frequency, RECURRING_FREQUENCIES);

      const parsed = recurringInputSchema.safeParse({
        name: asString(args.name) ?? current.name,
        kind: current.kind,
        categoryId: category ? category.id : current.categoryId,
        accountId: account ? account.id : current.accountId,
        amount: toNumber(args.amount) ?? current.amount,
        frequency: frequency ?? current.frequency,
        interval: current.interval,
        startDate: normalizeDate(args.startDate) ?? current.startDate,
        endDate: normalizeDate(args.endDate) ?? current.endDate,
        isActive: current.isActive,
        note: asString(args.note) ?? current.note,
      });
      if (!parsed.success) {
        return { ok: false, warnings, error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return { ok: true, fields: parsed.data, targetId: match.id, targetLabel: match.name, warnings };
    },
    execute: (fields, targetId) => updateRecurringRule(targetId!, undefined, toFormData(fields)),
  },

  {
    key: "recurring.delete",
    module: "recurring",
    label: "Delete recurring rule",
    requiresTarget: true,
    destructive: true,
    actionLabel: "Delete",
    promptDescription:
      "Remove an EXISTING recurring income/expense rule entirely. args: " +
      "ruleName (string, required — must refer to a rule the user already " +
      "has).",
    schema: emptySchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.ruleName);
      const match = matchByName(nameGuess, ref.recurringRules);
      if (!match) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess ? `Couldn't find a recurring rule named "${nameGuess}".` : "Missing rule name.",
        };
      }
      return { ok: true, fields: {}, targetId: match.id, targetLabel: match.name, warnings: [] };
    },
    execute: (_fields, targetId) => deleteRecurringRule(targetId!),
  },
];
