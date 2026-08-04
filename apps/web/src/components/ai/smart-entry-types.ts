import { INCOME_SOURCE_TYPES } from "@/lib/transactions/types";
import { INVESTMENT_TYPES } from "@/lib/investments/types";
import { LOAN_TYPES } from "@/lib/loans/types";
import { GOAL_PRIORITIES } from "@/lib/goals/types";
import { BUDGET_PERIODS } from "@/lib/budgets/types";
import { RECURRING_FREQUENCIES } from "@/lib/recurring/types";

/** Client-safe mirror of the server's reference lookups (id + name only —
 * no "server-only" import, so this can be passed from the page down into
 * client components). */
export interface OptionRef {
  id: string;
  name: string;
}

export interface SmartEntryReference {
  expenseCategories: OptionRef[];
  incomeCategories: OptionRef[];
  accounts: OptionRef[];
  investments: OptionRef[];
  loans: OptionRef[];
  goals: OptionRef[];
  recurringRules: OptionRef[];
  budgets: OptionRef[];
  transactions: OptionRef[];
}

/** What the client keeps for one draft — the server's `DraftResult` plus
 * local editing/selection/commit state. */
export interface DraftItemState {
  id: string;
  capability: string;
  moduleLabel: string;
  ok: boolean;
  fields: Record<string, unknown>;
  targetId?: string;
  targetLabel?: string;
  warnings: string[];
  error?: string;
  sourceText?: string;
  destructive: boolean;
  actionLabel: "Add" | "Save" | "Delete";
  /** Mirrors `AICapability.requiresClientEncryption` — true for every
   * create/log-against capability, meaning this draft must commit via
   * `client-commit.ts` (browser-side encrypt) rather than
   * `POST /api/v1/ai/commit`. See `SmartEntryView`. */
  requiresClientEncryption: boolean;
  selected: boolean;
  committing: boolean;
  commitError?: string;
}

export type FieldKind = "amount" | "date" | "text" | "select";
export type SelectSource = "expenseCategory" | "incomeCategory" | "account" | "enum";

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  selectSource?: SelectSource;
  enumOptions?: readonly string[];
}

export type TargetKind = "investment" | "loan" | "goal" | "budget" | "recurringRule" | "transaction";

/** Capabilities that act on an existing row — log-against (contribution/
 * payment), edit, and delete — get a target picker in addition to (or,
 * for delete, instead of) their own fields below. The value maps onto a
 * `SmartEntryReference` key via `${value}s` (see DraftCard). */
export const TARGET_KIND: Record<string, TargetKind | undefined> = {
  "transaction.edit": "transaction",
  "transaction.delete": "transaction",
  "investment.contribution": "investment",
  "investment.edit": "investment",
  "investment.delete": "investment",
  "loan.payment": "loan",
  "loan.edit": "loan",
  "loan.delete": "loan",
  "goal.contribution": "goal",
  "goal.edit": "goal",
  "goal.delete": "goal",
  "budget.edit": "budget",
  "budget.delete": "budget",
  "recurring.edit": "recurringRule",
  "recurring.delete": "recurringRule",
};

export const CAPABILITY_ICON: Record<string, string> = {
  "transaction.expense": "receipt",
  "transaction.income": "coins",
  "transaction.edit": "receipt",
  "investment.contribution": "trending-up",
  "investment.create": "trending-up",
  "investment.edit": "trending-up",
  "loan.payment": "landmark",
  "loan.create": "landmark",
  "loan.edit": "landmark",
  "goal.contribution": "target",
  "goal.create": "target",
  "goal.edit": "target",
  "budget.create": "wallet",
  "budget.edit": "wallet",
  "recurring.create": "layers",
  "recurring.edit": "layers",
};

/** One entry per capability — drives the editable fields on each draft
 * card. Every `key` here matches a field in that capability's real Zod
 * schema (see src/lib/ai/capabilities/definitions.ts); nothing is invented
 * here, this only decides how to *display* it. Delete capabilities have no
 * entry — they render a dedicated confirm-only card (see DraftCard). Edit
 * capabilities reuse their create counterpart's fields below, since the
 * underlying schema (and therefore shape) is identical. */
export const FIELD_SPECS: Record<string, FieldSpec[]> = {
  "transaction.expense": [
    { key: "amount", label: "Amount", kind: "amount" },
    { key: "date", label: "Date", kind: "date" },
    { key: "categoryId", label: "Category", kind: "select", selectSource: "expenseCategory" },
    { key: "accountId", label: "Account", kind: "select", selectSource: "account" },
    { key: "description", label: "Description", kind: "text" },
  ],
  "transaction.income": [
    { key: "amount", label: "Amount", kind: "amount" },
    { key: "date", label: "Date", kind: "date" },
    { key: "categoryId", label: "Category", kind: "select", selectSource: "incomeCategory" },
    {
      key: "sourceType",
      label: "Source",
      kind: "select",
      selectSource: "enum",
      enumOptions: INCOME_SOURCE_TYPES,
    },
    { key: "accountId", label: "Account", kind: "select", selectSource: "account" },
    { key: "description", label: "Description", kind: "text" },
  ],
  "investment.contribution": [
    { key: "amount", label: "Amount", kind: "amount" },
    { key: "contributedAt", label: "Date", kind: "date" },
  ],
  "investment.create": [
    { key: "name", label: "Name", kind: "text" },
    { key: "type", label: "Type", kind: "select", selectSource: "enum", enumOptions: INVESTMENT_TYPES },
    { key: "investedAmount", label: "Invested amount", kind: "amount" },
    { key: "currentValue", label: "Current value", kind: "amount" },
    { key: "monthlyContribution", label: "Monthly SIP", kind: "amount" },
    { key: "expectedReturn", label: "Expected return %", kind: "amount" },
    { key: "startDate", label: "Start date", kind: "date" },
  ],
  "loan.payment": [
    { key: "amount", label: "Amount", kind: "amount" },
    { key: "paidOn", label: "Date", kind: "date" },
  ],
  "loan.create": [
    { key: "name", label: "Name", kind: "text" },
    { key: "type", label: "Type", kind: "select", selectSource: "enum", enumOptions: LOAN_TYPES },
    { key: "principal", label: "Principal", kind: "amount" },
    { key: "interestRate", label: "Interest rate %", kind: "amount" },
    { key: "emi", label: "EMI", kind: "amount" },
    { key: "remainingAmount", label: "Remaining", kind: "amount" },
    { key: "startDate", label: "Start date", kind: "date" },
  ],
  "goal.contribution": [
    { key: "amount", label: "Amount", kind: "amount" },
    { key: "contributedAt", label: "Date", kind: "date" },
  ],
  "goal.create": [
    { key: "name", label: "Name", kind: "text" },
    { key: "targetAmount", label: "Target amount", kind: "amount" },
    { key: "currentAmount", label: "Already saved", kind: "amount" },
    { key: "deadline", label: "Deadline", kind: "date" },
    { key: "priority", label: "Priority", kind: "select", selectSource: "enum", enumOptions: GOAL_PRIORITIES },
    { key: "monthlyContribution", label: "Monthly contribution", kind: "amount" },
  ],
  "budget.create": [
    { key: "categoryId", label: "Category", kind: "select", selectSource: "expenseCategory" },
    { key: "period", label: "Period", kind: "select", selectSource: "enum", enumOptions: BUDGET_PERIODS },
    { key: "amount", label: "Amount", kind: "amount" },
    { key: "startsOn", label: "Starts on", kind: "date" },
  ],
  "recurring.create": [
    { key: "name", label: "Name", kind: "text" },
    {
      key: "kind",
      label: "Type",
      kind: "select",
      selectSource: "enum",
      enumOptions: ["income", "expense"] as const,
    },
    { key: "categoryId", label: "Category", kind: "select", selectSource: "expenseCategory" },
    { key: "accountId", label: "Account", kind: "select", selectSource: "account" },
    { key: "amount", label: "Amount", kind: "amount" },
    {
      key: "frequency",
      label: "Frequency",
      kind: "select",
      selectSource: "enum",
      enumOptions: RECURRING_FREQUENCIES,
    },
    { key: "startDate", label: "Start date", kind: "date" },
  ],
};

FIELD_SPECS["investment.edit"] = FIELD_SPECS["investment.create"];
FIELD_SPECS["loan.edit"] = FIELD_SPECS["loan.create"];
FIELD_SPECS["goal.edit"] = FIELD_SPECS["goal.create"];
FIELD_SPECS["budget.edit"] = FIELD_SPECS["budget.create"];
FIELD_SPECS["recurring.edit"] = FIELD_SPECS["recurring.create"];

/** transaction.edit's field set depends on which row matched (income vs
 * expense have different shapes) — resolved at render time, see DraftCard. */
export function transactionFieldSpecs(kind: unknown): FieldSpec[] {
  return kind === "income" ? FIELD_SPECS["transaction.income"] : FIELD_SPECS["transaction.expense"];
}
