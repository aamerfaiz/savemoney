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
  pgSchema,
  uuid,
  text,
  numeric,
  boolean,
  integer,
  timestamp,
  date,
  jsonb,
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
    /** AES-256-GCM ciphertext (packed iv+ciphertext, see
     * src/lib/vault/crypto.ts packPayload) under the user's vault DEK —
     * Phase 3.5.3. Postgres-level numeric constraints are lost here by
     * design; validation moves entirely to the client before encryption. */
    amount: text("amount").notNull(),
    currency: text("currency").notNull().default("USD"),
    /** Packed ciphertext, or NULL (never encrypt an absent value). */
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
    /** AES-256-GCM ciphertext (packed iv+ciphertext, see
     * src/lib/vault/crypto.ts packPayload) under the user's vault DEK —
     * Phase 3.5.3. Postgres-level numeric constraints are lost here by
     * design; validation moves entirely to the client before encryption. */
    amount: text("amount").notNull(),
    currency: text("currency").notNull().default("USD"),
    /** Packed ciphertext, or NULL (never encrypt an absent value). */
    description: text("description"),
    note: text("note"),
    /** Packed ciphertext of the JSON-serialized tag array, or NULL. Was a
     * native Postgres array; encrypting forecloses SQL-level tag filters,
     * same trade-off as every other encrypted column (see the plan doc). */
    tags: text("tags"),
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
    // Packed ciphertext (Phase 3.5.4, see docs/e2ee-path-b-plan.md) — was
    // numeric(14,2).
    amount: text("amount").notNull(),
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
    // Packed ciphertext (Phase 3.5.4, see docs/e2ee-path-b-plan.md) — was
    // numeric(14,2).
    targetAmount: text("target_amount").notNull(),
    currentAmount: text("current_amount").notNull(),
    currency: text("currency").notNull().default("USD"),
    deadline: date("deadline"),
    priority: goalPriority("priority").notNull().default("medium"),
    monthlyContribution: text("monthly_contribution"),
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
    // Packed ciphertext (Phase 3.5.4, see docs/e2ee-path-b-plan.md) — was
    // numeric(14,2).
    amount: text("amount").notNull(),
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
    // Packed ciphertext (Phase 3.5.4, see docs/e2ee-path-b-plan.md) — was
    // numeric(14,2). interestRate/remainingMonths stay plaintext.
    principal: text("principal").notNull(),
    interestRate: numeric("interest_rate", { precision: 6, scale: 3 })
      .notNull()
      .default("0"),
    emi: text("emi").notNull(),
    remainingAmount: text("remaining_amount").notNull(),
    remainingMonths: integer("remaining_months"),
    extraEmi: text("extra_emi"),
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
    // Packed ciphertext (Phase 3.5.4, see docs/e2ee-path-b-plan.md) — was
    // numeric(14,2).
    amount: text("amount").notNull(),
    principalComponent: text("principal_component"),
    interestComponent: text("interest_component"),
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
    // Packed ciphertext (Phase 3.5.4, see docs/e2ee-path-b-plan.md) — was
    // numeric(14,2).
    investedAmount: text("invested_amount").notNull(),
    currentValue: text("current_value").notNull(),
    monthlyContribution: text("monthly_contribution"),
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
    // Packed ciphertext (Phase 3.5.4, see docs/e2ee-path-b-plan.md) — was
    // numeric(14,2).
    amount: text("amount").notNull(),
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
    // Packed ciphertext (Phase 3.5.4, see docs/e2ee-path-b-plan.md) — was
    // numeric(14,2).
    amount: text("amount").notNull(),
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
    // Packed ciphertext (Phase 3.5.4, see docs/e2ee-path-b-plan.md) — was
    // numeric(14,2).
    totalAssets: text("total_assets").notNull(),
    totalLiabilities: text("total_liabilities").notNull(),
    netWorth: text("net_worth").notNull(),
    currency: text("currency").notNull().default("USD"),
    note: text("note"),
    ...audit,
  },
  (t) => [
    index("net_worth_snapshots_user_idx").on(t.userId),
    index("net_worth_snapshots_captured_idx").on(t.capturedAt),
  ],
);

/* ----------------------------------------------------------------------- */
/* Collections (Splitwise-style contribution pools, e.g. office gift money) */
/* ----------------------------------------------------------------------- */
/* One organizer (the signed-in user) tracks a roster of contributors and
 * what each put into a shared pool, plus what's been spent from it —
 * still a single-user-owned ledger today (no other party has an account
 * here), but `collection_contributors.linkedUserId` exists specifically so
 * a contributor can later be upgraded to a real linked account without a
 * schema change, once multi-user/invites are built. `targetAmount` is
 * optional: many collections just gather whatever comes in. Every total
 * (collected, spent, remaining) is derived client-side by summing decrypted
 * rows, never stored — sidesteps the read-modify-write race
 * `goals.current_amount` accepts (see its comment in lib/goals/actions.ts).
 * Spending is its own ledger (`collection_expenses`), not a single
 * collection-level payout — a collection can have many expenses over time,
 * each optionally linked to a real expense transaction. */

export const collectionStatus = pgEnum("collection_status", ["open", "closed"]);

export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    purpose: text("purpose"),
    icon: text("icon"),
    // Packed ciphertext (see docs/e2ee-path-b-plan.md) — optional, many
    // collections have no fixed target.
    targetAmount: text("target_amount"),
    currency: text("currency").notNull().default("USD"),
    eventDate: date("event_date"),
    status: collectionStatus("status").notNull().default("open"),
    ...audit,
  },
  (t) => [index("collections_user_idx").on(t.userId)],
);

/** A collection's roster — one row per person, contributions/expenses
 * reference this instead of re-typing a name on every row. `linkedUserId`
 * is the forward-compatibility hook for real multi-user support: always
 * null today (nobody but the organizer has an account), but a contributor
 * can be re-pointed at a real `auth.users` row later (e.g. after an invite
 * flow) without touching `collection_contributions`/`collection_expenses`
 * at all. */
export const collectionContributors = pgTable(
  "collection_contributors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    // Packed ciphertext — a contributor's display name, encrypted like
    // every other free-text field in this module.
    displayName: text("display_name").notNull(),
    linkedUserId: uuid("linked_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    ...audit,
  },
  (t) => [
    index("collection_contributors_collection_idx").on(t.collectionId),
    index("collection_contributors_user_idx").on(t.userId),
  ],
);

export const collectionContributions = pgTable(
  "collection_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    contributorId: uuid("contributor_id").references(() => collectionContributors.id, {
      onDelete: "set null",
    }),
    // Legacy fallback only — pre-roster-table rows (nullable so old rows
    // keep displaying via this while `contributor_id` is null; every new
    // contribution goes through `contributorId` instead and leaves this
    // null). Packed ciphertext, same as `contributorId`'s name.
    contributorName: text("contributor_name"),
    amount: text("amount").notNull(),
    contributedAt: date("contributed_at").notNull(),
    method: text("method"),
    note: text("note"),
    ...audit,
  },
  (t) => [
    index("collection_contrib_collection_idx").on(t.collectionId),
    index("collection_contrib_user_idx").on(t.userId),
    index("collection_contrib_contributor_idx").on(t.contributorId),
  ],
);

/** Money spent out of a collection's pool — plural and ongoing, replacing
 * the old single collection-level payout. `paidByContributorId` is optional
 * bookkeeping (who fronted it) that stays unused by any math today but sets
 * up real Splitwise-style per-expense splitting later without another
 * migration. `linkedTransactionId` mirrors the old payout's "log this as a
 * real expense too" link, now per expense instead of per collection. */
export const collectionExpenses = pgTable(
  "collection_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    // Packed ciphertext.
    amount: text("amount").notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    paidByContributorId: uuid("paid_by_contributor_id").references(() => collectionContributors.id, {
      onDelete: "set null",
    }),
    spentAt: date("spent_at").notNull(),
    linkedTransactionId: uuid("linked_transaction_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    ...audit,
  },
  (t) => [
    index("collection_expenses_collection_idx").on(t.collectionId),
    index("collection_expenses_user_idx").on(t.userId),
    index("collection_expenses_category_idx").on(t.categoryId),
    index("collection_expenses_linked_txn_idx").on(t.linkedTransactionId),
  ],
);

/* ----------------------------------------------------------------------- */
/* AI provider keys (Phase 3, BYOK) — private schema, NOT PostgREST-exposed */
/* ----------------------------------------------------------------------- */
/* Lives in its own Postgres schema (rather than `public`) so it is never
 * added to Supabase's exposed-schemas list — the anon/authenticated API
 * roles cannot select it at all, no matter what RLS says. The browser must
 * never be able to read a key, encrypted or not.
 * `db:generate` still diffs and emits DDL for this table (schemaFilter only
 * governs live-DB introspection, not codegen from this file) — see the
 * generated drizzle/0006_white_scorpion.sql, hand-patched with a leading
 * `CREATE SCHEMA IF NOT EXISTS "private"` since schema creation itself isn't
 * tracked in drizzle's snapshot. RLS + the PostgREST-role revokes are
 * hand-written in drizzle/manual/0006_ai_provider_keys_rls.sql, applied
 * after the generated migration. Declared here so server-only code can
 * query it type-safely through the direct Postgres client in
 * src/db/index.ts (never through the Supabase/PostgREST client). */

const privateSchema = pgSchema("private");

// Scoped to the `private` schema (not `pgEnum`'s default `public`) so it
// stays outside drizzle.config.ts's `schemaFilter: ["public"]` alongside the
// table below — both are hand-migrated together in drizzle/manual.
export const aiProvider = privateSchema.enum("ai_provider", [
  "deepseek",
  "openai",
  "gemini",
  "claude",
]);

export const aiProviderKeys = privateSchema.table(
  "ai_provider_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    provider: aiProvider("provider").notNull(),
    label: text("label"),
    /** AES-256-GCM ciphertext (base64) — never plaintext, never logged. */
    encryptedKey: text("encrypted_key").notNull(),
    keyIv: text("key_iv").notNull(),
    /** Last 4 chars of the plaintext key, for masked display only. */
    keyLast4: text("key_last4").notNull(),
    model: text("model"),
    isActive: boolean("is_active").notNull().default(true),
    ...audit,
  },
  (t) => [index("ai_provider_keys_user_idx").on(t.userId)],
);

/* ----------------------------------------------------------------------- */
/* Vault (Phase 3.5, E2EE "not even me") — private schema, NOT PostgREST-  */
/* exposed. See docs/e2ee-path-b-plan.md.                                  */
/* ----------------------------------------------------------------------- */
/* Never a plaintext-readable table: every column here is either ciphertext
 * or non-secret metadata (salts, KDF params, timestamps) that's useless
 * without the secret the user holds. No server-side "read plaintext" action
 * exists for either table below, by design — see the plan doc's "not even
 * me" goal. Same `private` schema / PostgREST-lockdown / RLS treatment as
 * `ai_provider_keys` above; RLS + revokes hand-written in
 * drizzle/manual/0007_vault_and_mcp_tokens_rls.sql. */

/** One row per user: the wrapped DEK, under each of its two mandatory
 * unlock paths (password, recovery key). A third, optional per-agent wrap
 * lives in `mcpAgentTokens` below, not here — it's independently
 * mintable/revocable and there can be many of them per user. */
export const vaultKeys = privateSchema.table(
  "vault_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** AES-256-GCM(DEK) under a KEK derived (Argon2id) from the vault
     * passphrase. */
    wrappedDekByPassword: text("wrapped_dek_by_password").notNull(),
    passwordDekIv: text("password_dek_iv").notNull(),
    passwordKekSalt: text("password_kek_salt").notNull(),
    /** Argon2id params used for the passphrase KEK (memory/iterations/
     * parallelism) — recorded per-user so they can be strengthened for new
     * setups without invalidating existing vaults. */
    passwordKdfParams: jsonb("password_kdf_params").notNull(),
    /** AES-256-GCM(DEK) under a KEK derived (HKDF — the recovery key is
     * already full-entropy random, not a human secret, so a slow KDF buys
     * nothing) from the one-time recovery key. */
    wrappedDekByRecovery: text("wrapped_dek_by_recovery").notNull(),
    recoveryDekIv: text("recovery_dek_iv").notNull(),
    recoveryKekSalt: text("recovery_kek_salt").notNull(),
    /** Set once the user has confirmed (at setup) that they saved the
     * recovery code. The code itself is never stored — this is just an
     * acknowledgment timestamp. */
    recoveryAcknowledgedAt: timestamp("recovery_acknowledged_at", {
      withTimezone: true,
    }),
    ...audit,
  },
  (t) => [index("vault_keys_user_idx").on(t.userId)],
);

export const mcpTokenScope = privateSchema.enum("mcp_token_scope", [
  /** Metadata/computed summaries only — never unwraps the DEK. Works
   * headless, no vault-gating. */
  "read_summary",
  /** Real field-level financial data — unwraps the DEK transiently,
   * per-call, via this token's own wrap. */
  "read_full",
]);

/** A user-mintable, independently revocable third unlock path for the DEK
 * (see docs/e2ee-path-b-plan.md "Resolved: MCP agent access"). Many rows
 * per user — one per connected agent/integration. */
export const mcpAgentTokens = privateSchema.table(
  "mcp_agent_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** User-facing name, e.g. "Claude Desktop", "budget-check automation". */
    label: text("label").notNull(),
    /** SHA-256 of the raw token, for lookup/rate-limiting only — never
     * usable to derive the KEK, so a DB leak alone doesn't unlock anything. */
    tokenHash: text("token_hash").notNull().unique(),
    /** AES-256-GCM(DEK) under an HKDF-derived KEK — see wrappedDekByRecovery
     * above for why no slow KDF is needed for a full-entropy secret. */
    wrappedDekByToken: text("wrapped_dek_by_token").notNull(),
    tokenDekIv: text("token_dek_iv").notNull(),
    tokenKekSalt: text("token_kek_salt").notNull(),
    scope: mcpTokenScope("scope").notNull().default("read_summary"),
    /** Phase 3.5.9 — a second, independent axis from `scope`: whether this
     * token can call write tools (create/update/delete) at all, on top of
     * whatever it can read. Defaults to `false` for every existing and new
     * token — write access is opt-in per token, never silently granted to
     * a token minted before this existed. Write tools additionally require
     * `scope = 'read_full'` (see mcp/session.ts) — a token that can't read
     * real amounts has no sane way to confirm a change to one either. */
    canWrite: boolean("can_write").notNull().default(false),
    /** Chosen by the user at creation (preset durations) but always capped
     * server-side — "no expiry" is never offered. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...audit,
  },
  (t) => [
    index("mcp_agent_tokens_user_idx").on(t.userId),
    index("mcp_agent_tokens_token_hash_idx").on(t.tokenHash),
  ],
);

/** Phase 3.5.9 — records that an MCP tool was called, never what it saw or
 * changed: `toolName`/`action`/`targetTable`/`targetId` only, no field
 * values, no ciphertext, no plaintext. Serves two purposes: the "who/when
 * a token was used" audit trail the plan doc calls for ("content stays
 * opaque, but usage isn't"), and a cheap basis for per-token rate
 * limiting (count recent rows instead of an in-memory counter, which
 * wouldn't be shared across serverless instances anyway). */
export const mcpToolCallLog = privateSchema.table(
  "mcp_tool_call_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => mcpAgentTokens.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    action: text("action").notNull(), // "read" | "propose" | "write"
    targetTable: text("target_table"),
    targetId: uuid("target_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mcp_tool_call_log_token_idx").on(t.tokenId, t.createdAt),
    index("mcp_tool_call_log_user_idx").on(t.userId),
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
export type Collection = typeof collections.$inferSelect;
export type CollectionContributor = typeof collectionContributors.$inferSelect;
export type CollectionContribution = typeof collectionContributions.$inferSelect;
export type CollectionExpense = typeof collectionExpenses.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AIProviderKey = typeof aiProviderKeys.$inferSelect;
export type VaultKeys = typeof vaultKeys.$inferSelect;
export type McpAgentToken = typeof mcpAgentTokens.$inferSelect;
