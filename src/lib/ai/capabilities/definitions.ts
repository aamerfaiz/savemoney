import "server-only";

import { z } from "zod";

import { deleteInvestment } from "@/lib/investments/actions";

import { deleteLoan } from "@/lib/loans/actions";

import { deleteGoal } from "@/lib/goals/actions";

import { deleteBudget } from "@/lib/budgets/actions";

import { deleteRecurringRule } from "@/lib/recurring/actions";

import type { AICapability } from "./types";
import { matchByName } from "./shared";
import { asString } from "./extract-utils";

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
 * extraEmi); no `investment.create`/`investment.edit`/
 * `investment.contribution` as of Phase 3.5.4 (investments.investedAmount/
 * currentValue/monthlyContribution); and no `recurring.create`/
 * `recurring.edit` as of Phase 3.5.4 (recurring_rules.amount) — all
 * removed, not disabled: once a table's amount is encrypted under the
 * vault DEK, this file's `execute()` calls — which run entirely
 * server-side via /api/v1/ai/commit — have no DEK to encrypt with.
 * Properly supporting them would mean moving amount validation
 * client-side (before encryption) while commit.ts's independent
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
 * `recurring.edit` has the plainer version of the same problem —
 * `fetchCurrentRecurring()`'s merge-on-edit read can't decrypt the current
 * amount server-side either, even though `recurring.create`/`.edit` are
 * otherwise plain overwrite writes with no running-total arithmetic.
 * Creating/editing a budget, goal, loan, investment, or recurring rule,
 * and logging a contribution or payment, all still work normally through
 * their own pages (client-side encrypt path).
 * `budget.delete`/`goal.delete`/`loan.delete`/`investment.delete`/
 * `recurring.delete` are unaffected (no amount involved) and stay. Only
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
