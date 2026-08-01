import "server-only";

import { z } from "zod";

import { deleteInvestment } from "@/lib/investments/actions";

import { deleteLoan } from "@/lib/loans/actions";

import { deleteGoal } from "@/lib/goals/actions";

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
  fetchCurrentRecurring,
} from "./shared";
import {
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
 * No `transaction.*` capabilities as of Phase 3.5.3; no `budget.create`/
 * `budget.edit` as of Phase 3.5.4 (budgets.amount); no `goal.create`/
 * `goal.edit`/`goal.contribution` as of Phase 3.5.4 (goals.targetAmount/
 * currentAmount/monthlyContribution); no `loan.create`/`loan.edit`/
 * `loan.payment` as of Phase 3.5.4 (loans.principal/emi/remainingAmount/
 * extraEmi); and no `investment.create`/`investment.edit`/
 * `investment.contribution` as of Phase 3.5.4 (investments.investedAmount/
 * currentValue/monthlyContribution) — all removed, not disabled: once a
 * table's amount is encrypted under the vault DEK, this file's `execute()`
 * calls — which run entirely server-side via /api/v1/ai/commit — have no
 * DEK to encrypt with. Properly supporting them would mean moving amount
 * validation client-side (before encryption) while commit.ts's independent
 * re-validation (`def.schema.safeParse`, the "never trust fields"
 * defense-in-depth check) can no longer inspect a real numeric amount
 * post-encryption — a real redesign of that trust boundary, not done here.
 * `goal.contribution`/`loan.payment`/`investment.contribution` have the
 * added wrinkle that they'd need the goal/loan/investment's *current*
 * decrypted amount to compute a new running total or split, which the
 * server can't read either (see the comments on
 * `EncryptedContributionInput` in src/lib/goals/actions.ts,
 * `EncryptedPaymentInput` in src/lib/loans/actions.ts, and
 * `EncryptedContributionInput` in src/lib/investments/actions.ts).
 * Creating/editing a budget, goal, loan, or investment, and logging a
 * contribution or payment, all still work normally through their own pages
 * (client-side encrypt path). `budget.delete`/`goal.delete`/`loan.delete`/
 * `investment.delete` are unaffected (no amount involved) and stay. Only
 * the natural-language Smart Entry shortcut is unavailable for these.
 */
export const CAPABILITY_DEFINITIONS: AICapability[] = [
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
