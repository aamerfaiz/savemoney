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
    ...audit,
  },
  (t) => [
    index("income_user_idx").on(t.userId),
    index("income_received_idx").on(t.receivedAt),
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
    ...audit,
  },
  (t) => [
    index("expenses_user_idx").on(t.userId),
    index("expenses_spent_idx").on(t.spentAt),
    index("expenses_category_idx").on(t.categoryId),
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
  (t) => [index("budgets_user_idx").on(t.userId)],
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
  (t) => [index("goal_contrib_goal_idx").on(t.goalId)],
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
  (t) => [index("loan_payments_loan_idx").on(t.loanId)],
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
