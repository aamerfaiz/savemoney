/**
 * Finance OS — Phase 1 database schema (Drizzle ORM / Postgres).
 *
 * Covers: profiles, accounts, categories, income, expenses, budgets,
 * savings goals (+ contributions) and loans (+ payments).
 *
 * Conventions:
 *  - Every user-owned row carries `userId` -> auth.users(id) for RLS.
 *  - Soft delete via `deletedAt` (spec: soft delete + audit).
 *  - Money stored as numeric(14,2); currency as ISO code per row so the
 *    multi-currency module can layer on top later.
 *
 * Row Level Security policies live in drizzle/0000_rls.sql and must be
 * applied alongside the generated schema migration.
 */
import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  integer,
  timestamp,
  date,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

/* ----------------------------------------------------------------------- */
/* Enums                                                                    */
/* ----------------------------------------------------------------------- */

export const accountType = pgEnum("account_type", [
  "cash",
  "bank",
  "credit_card",
  "wallet",
  "investment",
  "other",
]);

export const categoryKind = pgEnum("category_kind", ["income", "expense"]);

export const incomeType = pgEnum("income_type", [
  "salary",
  "freelance",
  "rental",
  "interest",
  "business",
  "dividend",
  "other",
]);

export const frequency = pgEnum("frequency", [
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);

export const budgetPeriod = pgEnum("budget_period", [
  "weekly",
  "monthly",
  "yearly",
]);

export const goalPriority = pgEnum("goal_priority", ["low", "medium", "high"]);

export const goalStatus = pgEnum("goal_status", [
  "active",
  "paused",
  "completed",
  "cancelled",
]);

export const loanType = pgEnum("loan_type", [
  "home",
  "car",
  "personal",
  "education",
  "credit_card",
  "other",
]);

export const investmentType = pgEnum("investment_type", [
  "stocks",
  "mutual_fund",
  "etf",
  "bonds",
  "crypto",
  "real_estate",
  "gold",
  "retirement",
  "other",
]);

/** Where an import batch came from — the shared import pipeline supports more
 *  than CSV over time (SMS/email/bank feeds all create batches). */
export const importSource = pgEnum("import_source", [
  "csv",
  "sms",
  "email",
  "bank",
  "manual",
]);

export const importStatus = pgEnum("import_status", [
  "completed",
  "rolled_back",
]);

/* Shared audit columns */
const audit = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

/* ----------------------------------------------------------------------- */
/* Profiles                                                                 */
/* ----------------------------------------------------------------------- */

export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  baseCurrency: text("base_currency").notNull().default("USD"),
  locale: text("locale").notNull().default("en-US"),
  ...audit,
});

/* ----------------------------------------------------------------------- */
/* Accounts                                                                 */
/* ----------------------------------------------------------------------- */

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: accountType("type").notNull().default("bank"),
    currency: text("currency").notNull().default("USD"),
    balance: numeric("balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    isActive: boolean("is_active").notNull().default(true),
    ...audit,
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

/* ----------------------------------------------------------------------- */
/* Categories (system defaults have userId = null)                          */
/* ----------------------------------------------------------------------- */

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => authUsers.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    kind: categoryKind("kind").notNull().default("expense"),
    icon: text("icon"),
    color: text("color"),
    parentId: uuid("parent_id"),
    isSystem: boolean("is_system").notNull().default(false),
    ...audit,
  },
  (t) => [index("categories_user_idx").on(t.userId)],
);

/* ----------------------------------------------------------------------- */
/* Import batches                                                            */
/* ----------------------------------------------------------------------- */
/* Every bulk import (CSV today; SMS/email/bank later) records a batch so the
 * imported rows can be traced and rolled back as a unit. Income/expense rows
 * carry `import_batch_id` pointing here. */

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    source: importSource("source").notNull().default("csv"),
    filename: text("filename"),
    totalRows: integer("total_rows").notNull().default(0),
    importedRows: integer("imported_rows").notNull().default(0),
    duplicateRows: integer("duplicate_rows").notNull().default(0),
    status: importStatus("status").notNull().default("completed"),
    ...audit,
  },
  (t) => [index("import_batches_user_idx").on(t.userId)],
);

/* ----------------------------------------------------------------------- */
/* Income                                                                   */
/* ----------------------------------------------------------------------- */

export const income = pgTable(
  "income",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    sourceType: incomeType("source_type").notNull().default("salary"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    description: text("description"),
    receivedAt: date("received_at").notNull(),
    isRecurring: boolean("is_recurring").notNull().default(false),
    frequency: frequency("frequency").notNull().default("one_time"),
    nextDate: date("next_date"),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    ...audit,
  },
  (t) => [
    index("income_user_idx").on(t.userId),
    index("income_received_idx").on(t.receivedAt),
    index("income_account_idx").on(t.accountId),
    index("income_category_idx").on(t.categoryId),
    index("income_import_batch_idx").on(t.importBatchId),
  ],
);

/* ----------------------------------------------------------------------- */
/* Expenses                                                                 */
/* ----------------------------------------------------------------------- */

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    description: text("description"),
    note: text("note"),
    tags: text("tags").array(),
    spentAt: date("spent_at").notNull(),
    isRecurring: boolean("is_recurring").notNull().default(false),
    frequency: frequency("frequency").notNull().default("one_time"),
    nextDate: date("next_date"),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    ...audit,
  },
  (t) => [
    index("expenses_user_idx").on(t.userId),
    index("expenses_spent_idx").on(t.spentAt),
    index("expenses_category_idx").on(t.categoryId),
    index("expenses_account_idx").on(t.accountId),
    index("expenses_import_batch_idx").on(t.importBatchId),
  ],
);

/* ----------------------------------------------------------------------- */
/* Budgets                                                                  */
/* ----------------------------------------------------------------------- */

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "cascade",
    }),
    period: budgetPeriod("period").notNull().default("monthly"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    startsOn: date("starts_on").notNull(),
    ...audit,
  },
  (t) => [
    index("budgets_user_idx").on(t.userId),
    index("budgets_category_idx").on(t.categoryId),
  ],
);

/* ----------------------------------------------------------------------- */
/* Savings Goals                                                            */
/* ----------------------------------------------------------------------- */

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    targetAmount: numeric("target_amount", { precision: 14, scale: 2 })
      .notNull(),
    currentAmount: numeric("current_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    currency: text("currency").notNull().default("USD"),
    deadline: date("deadline"),
    priority: goalPriority("priority").notNull().default("medium"),
    monthlyContribution: numeric("monthly_contribution", {
      precision: 14,
      scale: 2,
    }),
    status: goalStatus("status").notNull().default("active"),
    ...audit,
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);

export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    contributedAt: date("contributed_at").notNull(),
    note: text("note"),
    ...audit,
  },
  (t) => [
    index("goal_contrib_goal_idx").on(t.goalId),
    index("goal_contrib_user_idx").on(t.userId),
  ],
);

/* ----------------------------------------------------------------------- */
/* Loans                                                                    */
/* ----------------------------------------------------------------------- */

export const loans = pgTable(
  "loans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: loanType("type").notNull().default("personal"),
    principal: numeric("principal", { precision: 14, scale: 2 }).notNull(),
    interestRate: numeric("interest_rate", { precision: 6, scale: 3 })
      .notNull()
      .default("0"),
    emi: numeric("emi", { precision: 14, scale: 2 }).notNull().default("0"),
    remainingAmount: numeric("remaining_amount", { precision: 14, scale: 2 })
      .notNull(),
    remainingMonths: integer("remaining_months"),
    extraEmi: numeric("extra_emi", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    startDate: date("start_date").notNull(),
    ...audit,
  },
  (t) => [index("loans_user_idx").on(t.userId)],
);

export const loanPayments = pgTable(
  "loan_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loanId: uuid("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    principalComponent: numeric("principal_component", {
      precision: 14,
      scale: 2,
    }),
    interestComponent: numeric("interest_component", {
      precision: 14,
      scale: 2,
    }),
    paidOn: date("paid_on").notNull(),
    isExtra: boolean("is_extra").notNull().default(false),
    ...audit,
  },
  (t) => [
    index("loan_payments_loan_idx").on(t.loanId),
    index("loan_payments_user_idx").on(t.userId),
  ],
);

/* ----------------------------------------------------------------------- */
/* Investments                                                             */
/* ----------------------------------------------------------------------- */
/* A holding tracked at cost basis (`invested_amount`) and latest market value
 * (`current_value`). `monthly_contribution` is the recurring SIP that feeds
 * safe-to-spend; `expected_return` (annual %) drives the future-value
 * projection engine. Contributions are logged in `investment_contributions`. */

export const investments = pgTable(
  "investments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    type: investmentType("type").notNull().default("stocks"),
    investedAmount: numeric("invested_amount", { precision: 14, scale: 2 })
      .notNull(),
    currentValue: numeric("current_value", { precision: 14, scale: 2 })
      .notNull(),
    monthlyContribution: numeric("monthly_contribution", {
      precision: 14,
      scale: 2,
    }),
    /** Expected annual return as a percentage, e.g. 8.0 — drives projection. */
    expectedReturn: numeric("expected_return", { precision: 6, scale: 3 })
      .notNull()
      .default("8"),
    currency: text("currency").notNull().default("USD"),
    startDate: date("start_date").notNull(),
    ...audit,
  },
  (t) => [
    index("investments_user_idx").on(t.userId),
    index("investments_account_idx").on(t.accountId),
  ],
);

export const investmentContributions = pgTable(
  "investment_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investmentId: uuid("investment_id")
      .notNull()
      .references(() => investments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    contributedAt: date("contributed_at").notNull(),
    note: text("note"),
    ...audit,
  },
  (t) => [
    index("investment_contrib_investment_idx").on(t.investmentId),
    index("investment_contrib_user_idx").on(t.userId),
  ],
);

/* ----------------------------------------------------------------------- */
/* Recurring rules                                                         */
/* ----------------------------------------------------------------------- */
/* A template that fires an income or expense on a cadence (`frequency` every
 * `interval` periods) from `start_date` until an optional `end_date`. The pure
 * engine in src/lib/finance/recurring.ts projects the next occurrence(s); the
 * bill calendar and dashboard "upcoming" both read from these. `is_active`
 * pauses a rule without deleting its history. */

export const recurringRules = pgTable(
  "recurring_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: categoryKind("kind").notNull().default("expense"),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    frequency: frequency("frequency").notNull().default("monthly"),
    /** Repeat every N periods of `frequency` (>= 1). */
    interval: integer("interval").notNull().default(1),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(true),
    note: text("note"),
    ...audit,
  },
  (t) => [
    index("recurring_rules_user_idx").on(t.userId),
    index("recurring_rules_category_idx").on(t.categoryId),
    index("recurring_rules_account_idx").on(t.accountId),
  ],
);

/* ----------------------------------------------------------------------- */
/* Notifications                                                           */
/* ----------------------------------------------------------------------- */
/* User-facing alerts. Most are derived live from state (bill due, budget
 * overspend, goal milestone) by the generator in src/lib/notifications; this
 * table persists read/dismissed state so an alert the user has cleared stays
 * cleared, keyed by the generator's stable `dedupe_key`. Ad-hoc rows (with a
 * null dedupe_key) can also be inserted directly. */

export const notificationType = pgEnum("notification_type", [
  "bill_due",
  "budget_overspend",
  "goal_milestone",
  "low_safe_to_spend",
  "loan_paid_off",
  "general",
]);

export const notificationSeverity = pgEnum("notification_severity", [
  "info",
  "warning",
  "positive",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull().default("general"),
    severity: notificationSeverity("severity").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body"),
    /** Deep link into the app (e.g. "/budget"). */
    href: text("href"),
    /** Stable identity for a derived alert, so read/dismiss state sticks. */
    dedupeKey: text("dedupe_key"),
    isRead: boolean("is_read").notNull().default(false),
    isDismissed: boolean("is_dismissed").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...audit,
  },
  (t) => [
    index("notifications_user_idx").on(t.userId),
    index("notifications_dedupe_idx").on(t.userId, t.dedupeKey),
  ],
);

/* ----------------------------------------------------------------------- */
/* Net worth snapshots                                                     */
/* ----------------------------------------------------------------------- */
/* A point-in-time capture of assets vs liabilities so real net-worth history
 * accrues over time (the breakdown is composed live from investments, goals
 * and loans; these rows persist the totals as they stood on `captured_at`). */

export const netWorthSnapshots = pgTable(
  "net_worth_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    capturedAt: date("captured_at").notNull(),
    totalAssets: numeric("total_assets", { precision: 14, scale: 2 }).notNull(),
    totalLiabilities: numeric("total_liabilities", { precision: 14, scale: 2 })
      .notNull(),
    netWorth: numeric("net_worth", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    note: text("note"),
    ...audit,
  },
  (t) => [
    index("net_worth_snapshots_user_idx").on(t.userId),
    index("net_worth_snapshots_captured_idx").on(t.capturedAt),
  ],
);

/* Convenience type exports */
export type Profile = typeof profiles.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Income = typeof income.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type GoalContribution = typeof goalContributions.$inferSelect;
export type Loan = typeof loans.$inferSelect;
export type LoanPayment = typeof loanPayments.$inferSelect;
export type Investment = typeof investments.$inferSelect;
export type InvestmentContribution =
  typeof investmentContributions.$inferSelect;
export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
