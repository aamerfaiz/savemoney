import "server-only";

import { z } from "zod";

import { transactionInputSchema, INCOME_SOURCE_TYPES } from "@/lib/transactions/types";

import {
  investmentInputSchema,
  contributionInputSchema as investmentContributionSchema,
  INVESTMENT_TYPES,
} from "@/lib/investments/types";
import { deleteInvestment } from "@/lib/investments/actions";

import { loanInputSchema, paymentInputSchema, LOAN_TYPES } from "@/lib/loans/types";
import { deleteLoan } from "@/lib/loans/actions";

import {
  goalInputSchema,
  contributionInputSchema as goalContributionSchema,
  GOAL_PRIORITIES,
  GOAL_ICONS,
} from "@/lib/goals/types";
import { deleteGoal } from "@/lib/goals/actions";

import { budgetInputSchema, BUDGET_PERIODS } from "@/lib/budgets/types";
import { deleteBudget } from "@/lib/budgets/actions";

import { recurringInputSchema, RECURRING_FREQUENCIES } from "@/lib/recurring/types";
import { deleteRecurringRule } from "@/lib/recurring/actions";

import {
  collectionInputSchema,
  expenseInputSchema,
  COLLECTION_ICONS,
  COLLECTION_STATUSES,
} from "@/lib/collections/types";
import { deleteCollection } from "@/lib/collections/actions";

import type { AICapability } from "./types";
import { matchByName } from "./shared";
import { asBool, asString, normalizeDate, normalizeEnum, todayISO, toNumber } from "./extract-utils";

/** Trivial schema for delete capabilities — nothing to validate. */
const emptySchema = z.object({});

/** `requiresClientEncryption` capabilities never actually reach this — see
 * that flag's doc comment on `AICapability` (types.ts) and `commit.ts`,
 * which refuses these before calling `execute` at all. Kept as a defensive
 * stub, not dead code: it's what runs if `/api/v1/ai/commit` is ever hit
 * for one of these directly, instead of silently writing a plaintext value
 * into a ciphertext column. */
async function clientOnlyExecute(): Promise<{ ok: boolean; error?: string }> {
  return {
    ok: false,
    error: "This has an encrypted amount and can only be confirmed from the browser — try again from the Manage tab.",
  };
}

interface ContributorDraft {
  contributorName: string;
  amount: number;
  contributedAt: string;
  method: string | null;
}

/** Parses the model's freeform `contributors` array arg (used by
 * `collection.create`/`collection.edit` to let one prompt record several
 * people's contributions at once) into validated drafts. Never throws — a
 * malformed entry is skipped with a warning rather than failing the whole
 * capability, same philosophy as every other coercion in extract-utils.ts. */
function parseContributorsArg(raw: unknown): {
  contributors: ContributorDraft[];
  warnings: string[];
} {
  const warnings: string[] = [];
  if (!Array.isArray(raw)) return { contributors: [], warnings };

  const contributors: ContributorDraft[] = [];
  for (const item of raw.slice(0, 30)) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const name = asString(obj.name) ?? asString(obj.contributorName);
    const amount = toNumber(obj.amount);
    if (!name || amount == null) {
      warnings.push("Skipped a contributor entry that was missing a name or amount.");
      continue;
    }
    contributors.push({
      contributorName: name,
      amount,
      contributedAt: normalizeDate(obj.date) ?? normalizeDate(obj.contributedAt) ?? todayISO(),
      method: asString(obj.method),
    });
  }
  return { contributors, warnings };
}

/**
 * Every capability Smart Entry can propose. One entry per existing
 * create/log/delete Server Action — see `docs/ai-smart-entry-plan.md`.
 *
 * **Create and log-against capabilities (everything except the plain
 * deletes below) got their amount fields vault-encrypted across Phase
 * 3.5.3/3.5.4 and were removed here entirely for a while, since this file
 * used to call the real Server Action directly with a plaintext amount —
 * which no longer works (the columns are ciphertext, and the server never
 * holds the DEK to encrypt one). They're back as of the "client-side
 * commit" pass (see docs/ai-smart-entry-plan.md): `resolve()` below still
 * runs entirely server-side and is unchanged — it only *validates and
 * displays* a plaintext draft, never writes it — but each one now has
 * `requiresClientEncryption: true`, meaning the actual write happens in
 * the browser via `src/lib/ai/capabilities/client-commit.ts`, calling the
 * exact same `encryptedCreate*`/`encryptedRecord*`/`encryptedAddContribution`
 * client-action wrapper the module's own manual form already uses — so
 * manual forms and AI drafts still share one real write path, just not
 * one `execute()` function anymore.
 *
 * Editing or deleting an existing transaction/investment/loan/goal/budget/
 * recurring rule through Smart Entry (as opposed to creating one, or
 * logging a contribution/payment against one) is deliberately still out of
 * scope: an edit has to merge the user's requested changes onto the row's
 * *current* values, which means decrypting that current row first — for
 * investments/loans/goals that data is already available client-side via
 * `useSideData()` (see `client-commit.ts`), but wiring the merge-on-edit
 * logic through it, plus doing the same for budgets/recurring rules/
 * transactions (which have no equivalent decrypted-list hook on this page
 * yet), is a real follow-up, not done here. `transaction.edit`/
 * `transaction.delete` stay unavailable for the same reason `shared.ts`'s
 * `ReferenceData.transactions` explains: encrypted amounts, nothing
 * plaintext left server-side to match a description against.
 */
export const CAPABILITY_DEFINITIONS: AICapability[] = [
  {
    key: "transaction.expense",
    module: "transaction",
    label: "Expense",
    requiresTarget: false,
    requiresClientEncryption: true,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "A single expense already made or being made now — money spent on " +
      "something (food, transport, shopping, bills, etc.), never money " +
      "invested, saved toward a goal, or put toward a loan — those are " +
      "separate capabilities below. args: amount (number, required), date " +
      "(YYYY-MM-DD, optional, defaults to today), categoryName (string, best " +
      "guess), accountName (string, optional), description (short string, " +
      "optional).",
    schema: transactionInputSchema,
    async resolve(args, ref) {
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings: [], error: "Missing or invalid amount." };

      const warnings: string[] = [];
      const categoryGuess = asString(args.categoryName);
      const category = matchByName(categoryGuess, ref.expenseCategories);
      if (categoryGuess && !category) {
        warnings.push(`Couldn't match category "${categoryGuess}" — pick one below.`);
      }
      const accountGuess = asString(args.accountName);
      const account = matchByName(accountGuess, ref.accounts);
      if (accountGuess && !account) {
        warnings.push(`Couldn't match account "${accountGuess}" — pick one below.`);
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
    execute: clientOnlyExecute,
  },

  {
    key: "transaction.income",
    module: "transaction",
    label: "Income",
    requiresTarget: false,
    requiresClientEncryption: true,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "A single income already received. args: amount (number, required), date " +
      "(YYYY-MM-DD, optional, defaults to today), sourceType (one of salary/" +
      "freelance/rental/interest/business/dividend/other, optional), " +
      "accountName (string, optional), description (short string, optional).",
    schema: transactionInputSchema,
    async resolve(args, ref) {
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings: [], error: "Missing or invalid amount." };

      const warnings: string[] = [];
      const accountGuess = asString(args.accountName);
      const account = matchByName(accountGuess, ref.accounts);
      if (accountGuess && !account) {
        warnings.push(`Couldn't match account "${accountGuess}" — pick one below.`);
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
    execute: clientOnlyExecute,
  },

  {
    key: "investment.contribution",
    module: "investment",
    label: "Investment contribution",
    requiresTarget: true,
    requiresClientEncryption: true,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "Money added to an EXISTING investment holding (a SIP/top-up, not a new " +
      "holding) — the user already has this investment and is adding to it. " +
      "args: investmentName (string, required — must refer to a holding the " +
      "user already has), amount (number, required), date (YYYY-MM-DD, " +
      "optional, defaults to today).",
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
      // shows a picker (never a guessed id) and the client commit
      // dispatcher re-requires it before it can look up the decrypted row.
      return {
        ok: true,
        fields: parsed.data,
        targetId: investment?.id,
        targetLabel: investment?.name,
        warnings,
      };
    },
    execute: clientOnlyExecute,
  },

  {
    key: "investment.create",
    module: "investment",
    label: "New investment",
    requiresTarget: false,
    requiresClientEncryption: true,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "A brand-new investment holding the user is starting — never use this " +
      "for money added to a holding they already have (see " +
      "investment.contribution instead). args: name (string, required), type " +
      "(one of stocks/mutual_fund/etf/bonds/crypto/real_estate/gold/" +
      "retirement/other, optional), investedAmount (number, required), " +
      "currentValue (number, optional — defaults to investedAmount for a " +
      "fresh holding), monthlyContribution (number, optional), " +
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
    execute: clientOnlyExecute,
  },

  {
    key: "investment.delete",
    module: "investment",
    label: "Delete investment",
    requiresTarget: true,
    requiresClientEncryption: false,
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
    requiresClientEncryption: true,
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
    execute: clientOnlyExecute,
  },

  {
    key: "loan.create",
    module: "loan",
    label: "New loan",
    requiresTarget: false,
    requiresClientEncryption: true,
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
    execute: clientOnlyExecute,
  },

  {
    key: "loan.delete",
    module: "loan",
    label: "Delete loan",
    requiresTarget: true,
    requiresClientEncryption: false,
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
    requiresClientEncryption: true,
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
    execute: clientOnlyExecute,
  },

  {
    key: "goal.create",
    module: "goal",
    label: "New goal",
    requiresTarget: false,
    requiresClientEncryption: true,
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
    execute: clientOnlyExecute,
  },

  {
    key: "goal.delete",
    module: "goal",
    label: "Delete goal",
    requiresTarget: true,
    requiresClientEncryption: false,
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
    key: "budget.create",
    module: "budget",
    label: "New budget",
    requiresTarget: false,
    requiresClientEncryption: true,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "A new spending budget/limit. args: categoryName (string, optional — " +
      "omit for an overall/all-spending budget), period (one of weekly/" +
      "monthly/yearly, optional, defaults to monthly), amount (number, " +
      "required), startsOn (YYYY-MM-DD, optional, defaults to today).",
    schema: budgetInputSchema,
    async resolve(args, ref) {
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
    execute: clientOnlyExecute,
  },

  {
    key: "budget.delete",
    module: "budget",
    label: "Delete budget",
    requiresTarget: true,
    requiresClientEncryption: false,
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
    requiresClientEncryption: true,
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
    execute: clientOnlyExecute,
  },

  {
    key: "recurring.delete",
    module: "recurring",
    label: "Delete recurring rule",
    requiresTarget: true,
    requiresClientEncryption: false,
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

  {
    key: "collection.create",
    module: "collection",
    label: "New collection",
    requiresTarget: false,
    requiresClientEncryption: true,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "A brand-new contribution pool the user is starting to collect money " +
      "into — Splitwise-style but single-organizer, e.g. office gift money " +
      "or a group buy, never a personal expense/income/investment/loan/goal " +
      "(those are separate capabilities above). args: title (string, " +
      "required), purpose (string, optional), targetAmount (number, " +
      "optional — omit if there's no fixed target), eventDate (YYYY-MM-DD, " +
      "optional), contributors (array, optional — each item: {name (string, " +
      "required), amount (number, required), date (YYYY-MM-DD, optional, " +
      'defaults to today), method (string, optional)} — use this when the ' +
      "user gives a full set of contributors in one message, e.g. \"start a " +
      "collection for Priya's farewell, Alice gave 500 and Bob gave 300\").",
    schema: collectionInputSchema,
    async resolve(args) {
      const title = asString(args.title);
      if (!title) return { ok: false, warnings: [], error: "Missing collection title." };
      const icon = normalizeEnum(args.icon, COLLECTION_ICONS) ?? "gift";

      const parsed = collectionInputSchema.safeParse({
        title,
        purpose: asString(args.purpose),
        icon,
        targetAmount: toNumber(args.targetAmount),
        eventDate: normalizeDate(args.eventDate),
        status: "open",
      });
      if (!parsed.success) {
        return { ok: false, warnings: [], error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }

      const { contributors, warnings } = parseContributorsArg(args.contributors);
      const fields: Record<string, unknown> = { ...parsed.data };
      if (contributors.length > 0) {
        fields.contributors = contributors;
        warnings.push(
          `Will also record ${contributors.length} contribution${contributors.length === 1 ? "" : "s"}: ` +
            contributors.map((c) => `${c.contributorName} (${c.amount})`).join(", "),
        );
      }
      return { ok: true, fields, warnings };
    },
    execute: clientOnlyExecute,
  },

  {
    key: "collection.contribution",
    module: "collection",
    label: "Collection contribution",
    requiresTarget: true,
    requiresClientEncryption: true,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "Money one person contributed toward an EXISTING open collection " +
      "pool. args: collectionTitle (string, required — must refer to an " +
      "open collection the user already has), contributorName (string, " +
      "required — who gave the money; matched against, or added to, that " +
      "collection's participant roster), amount (number, required), date " +
      "(YYYY-MM-DD, optional, defaults to today), method (string, optional).",
    // Decorative only — `requiresClientEncryption` capabilities never reach
    // commit.ts's schema check (see `clientOnlyExecute`'s comment below).
    // `contributionInputSchema` (collections/types.ts) needs a resolved
    // `participantId`, which this capability can't produce server-side
    // (participant names are encrypted — see client-commit.ts's
    // `collection.contribution` case, which resolves/creates the
    // participant client-side instead), so this uses a lighter shape.
    schema: z.object({
      contributorName: z.string().min(1),
      amount: z.number().positive(),
      contributedAt: z.string(),
      method: z.string().nullable().optional(),
    }),
    async resolve(args, ref) {
      const nameGuess = asString(args.collectionTitle);
      const collection = matchByName(nameGuess, ref.collections);
      const warnings: string[] = [];
      if (!collection) {
        warnings.push(
          nameGuess
            ? `Couldn't match collection "${nameGuess}" — pick one below.`
            : "No collection specified — pick one below.",
        );
      }
      const contributorName = asString(args.contributorName);
      const amount = toNumber(args.amount);
      if (!contributorName || amount == null) {
        return { ok: false, warnings, error: "Missing contributor name or amount." };
      }

      // `contributorName` is a free-text name here, not a resolved id — the
      // client's decrypted participant roster (only it can read those
      // names) does the real match-or-create at commit time.
      return {
        ok: true,
        fields: {
          contributorName,
          amount,
          contributedAt: normalizeDate(args.date) ?? todayISO(),
          method: asString(args.method),
        },
        targetId: collection?.id,
        targetLabel: collection?.name,
        warnings,
      };
    },
    execute: clientOnlyExecute,
  },

  {
    key: "collection.edit",
    module: "collection",
    label: "Edit collection",
    requiresTarget: true,
    requiresClientEncryption: true,
    destructive: false,
    actionLabel: "Save",
    promptDescription:
      "Change something about an EXISTING collection — its purpose, target " +
      "amount, event date, or open/closed status — and/or bulk-add more " +
      "contributors to it in the same request. Only include the args the " +
      "user actually mentioned; everything else is left unchanged. args: " +
      "collectionTitle (string, required — must refer to a collection the " +
      "user already has), title (string, optional — a rename), purpose " +
      "(string, optional), targetAmount (number, optional), eventDate " +
      "(YYYY-MM-DD, optional), status (open or closed, optional), " +
      "contributors (array, optional, same shape as collection.create's).",
    schema: collectionInputSchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.collectionTitle);
      const collection = matchByName(nameGuess, ref.collections);
      if (!collection) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess
            ? `Couldn't find a collection named "${nameGuess}".`
            : "Missing which collection to edit.",
        };
      }

      // Only the args the model actually supplied are validated and
      // included — anything omitted stays out of `fields` entirely so
      // client-commit.ts's merge (against the already-decrypted current
      // row) leaves it untouched, same reasoning as goal.contribution
      // needing the goal's current amount rather than resolve() guessing.
      const candidate: Record<string, unknown> = {};
      const title = asString(args.title);
      if (title) candidate.title = title;
      if (args.purpose !== undefined) candidate.purpose = asString(args.purpose);
      const icon = normalizeEnum(args.icon, COLLECTION_ICONS);
      if (icon) candidate.icon = icon;
      const targetAmount = toNumber(args.targetAmount);
      if (targetAmount != null) candidate.targetAmount = targetAmount;
      const eventDate = normalizeDate(args.eventDate);
      if (eventDate) candidate.eventDate = eventDate;
      const status = normalizeEnum(args.status, COLLECTION_STATUSES);
      if (status) candidate.status = status;

      const parsed = collectionInputSchema.partial().safeParse(candidate);
      if (!parsed.success) {
        return { ok: false, warnings: [], error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }

      const { contributors, warnings } = parseContributorsArg(args.contributors);
      const fields: Record<string, unknown> = { ...parsed.data };
      if (contributors.length > 0) {
        fields.contributors = contributors;
        warnings.push(
          `Will also record ${contributors.length} new contribution${contributors.length === 1 ? "" : "s"}.`,
        );
      }
      if (Object.keys(parsed.data).length === 0 && contributors.length === 0) {
        return {
          ok: false,
          warnings,
          error: "Nothing to change — mention what to update or who contributed.",
        };
      }
      return { ok: true, fields, targetId: collection.id, targetLabel: collection.name, warnings };
    },
    execute: clientOnlyExecute,
  },

  {
    key: "collection.expense",
    module: "collection",
    label: "Collection expense",
    requiresTarget: true,
    requiresClientEncryption: true,
    destructive: false,
    actionLabel: "Add",
    promptDescription:
      "Money spent out of an EXISTING open collection's pool — a collection " +
      "can have several of these over time (it does NOT close the " +
      "collection; that's a separate collection.edit status change). args: " +
      "collectionTitle (string, required — must refer to an open collection " +
      "the user already has), amount (number, required), description " +
      "(string, optional — what it was spent on), categoryName (string, " +
      "optional), date (YYYY-MM-DD, optional, defaults to today).",
    schema: expenseInputSchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.collectionTitle);
      const collection = matchByName(nameGuess, ref.collections);
      const warnings: string[] = [];
      if (!collection) {
        warnings.push(
          nameGuess
            ? `Couldn't match collection "${nameGuess}" — pick one below.`
            : "No collection specified — pick one below.",
        );
      }
      const amount = toNumber(args.amount);
      if (amount == null) return { ok: false, warnings, error: "Missing or invalid amount." };

      const categoryGuess = asString(args.categoryName);
      const category = matchByName(categoryGuess, ref.expenseCategories);
      if (categoryGuess && !category) {
        warnings.push(`Couldn't match category "${categoryGuess}" — pick one below.`);
      }

      const parsed = expenseInputSchema.safeParse({
        amount,
        description: asString(args.description),
        categoryId: category?.id ?? null,
        paidByParticipantId: null,
        spentAt: normalizeDate(args.date) ?? todayISO(),
        linkToTransaction: false,
        accountId: null,
      });
      if (!parsed.success) {
        return { ok: false, warnings, error: parsed.error.issues[0]?.message ?? "Invalid data." };
      }
      return {
        ok: true,
        fields: parsed.data,
        targetId: collection?.id,
        targetLabel: collection?.name,
        warnings,
      };
    },
    execute: clientOnlyExecute,
  },

  {
    key: "collection.delete",
    module: "collection",
    label: "Delete collection",
    requiresTarget: true,
    requiresClientEncryption: false,
    destructive: true,
    actionLabel: "Delete",
    promptDescription:
      "Remove an EXISTING collection entirely, along with all of its " +
      "contributors. args: collectionTitle (string, required — must refer " +
      "to a collection the user already has).",
    schema: emptySchema,
    async resolve(args, ref) {
      const nameGuess = asString(args.collectionTitle);
      const match = matchByName(nameGuess, ref.collections);
      if (!match) {
        return {
          ok: false,
          warnings: [],
          error: nameGuess
            ? `Couldn't find a collection named "${nameGuess}".`
            : "Missing collection name.",
        };
      }
      return { ok: true, fields: {}, targetId: match.id, targetLabel: match.name, warnings: [] };
    },
    execute: (_fields, targetId) => deleteCollection(targetId!),
  },
];
