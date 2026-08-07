import "server-only";

/**
 * Write tools (Phase 3.5.9). Every tool follows the same stateless
 * confirm-gate: called without `confirm: true`, it computes and returns a
 * plan (what would change, with real decrypted numbers so a human can
 * sanity-check it) but touches no row; called again with `confirm: true`
 * (same arguments), it performs the exact same computation and commits it.
 * There's no server-side "pending draft" state to hijack between the two
 * calls — the second call is a fresh, independently-authorized write, not a
 * confirmation of something stored earlier. This is deliberate: it avoids
 * needing a pending-writes table, at the cost of trusting the calling agent
 * to resend identical arguments (an MCP client that mutates args between
 * the preview and the confirm call gets a plan that doesn't match what it
 * saw — same failure mode as any tool that reads back what it's about to
 * write, this just needed the tradeoff written down explicitly).
 *
 * Every mutation is scoped by BOTH `id` and `session.userId` in its WHERE
 * clause — never `id` alone — mirroring the IDOR discipline established in
 * vault/rotation-actions.ts and backfill-actions.ts. There is no RLS on an
 * MCP call (see mcp/session.ts); this file is the entire enforcement point.
 */

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import type { McpSession } from "../session";
import { decryptPacked, encryptPacked } from "../server-crypto";
import {
  getBaseCurrency,
  loadAccountMap,
  loadCategoryMap,
  matchByName,
  requireWriteAccess,
} from "./shared";

/** True once the caller has resent the same call with `confirm: true`. */
const confirmShape = { confirm: z.boolean().default(false).describe("Set true to actually apply this change. Omit or false to preview it first.") };

function preview(action: string, plan: Record<string, unknown>) {
  return {
    status: "preview" as const,
    action,
    plan,
    message: "Nothing was changed. Call this same tool again with confirm: true (and the same arguments) to apply it.",
  };
}

async function decryptOrNull(value: string | null, dek: CryptoKey): Promise<number | null> {
  if (value === null) return null;
  try {
    return Number(await decryptPacked(value, dek));
  } catch {
    return null;
  }
}

async function decryptStrOrNull(value: string | null, dek: CryptoKey): Promise<string | null> {
  if (value === null) return null;
  try {
    return await decryptPacked(value, dek);
  } catch {
    return null;
  }
}

const dateShape = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/* ----------------------------------------------------------------------- */
/* Transactions                                                            */
/* ----------------------------------------------------------------------- */

export const createTransactionSchema = {
  kind: z.enum(["income", "expense"]),
  amount: z.number().positive().max(1_000_000_000),
  date: dateShape.describe("ISO date. Defaults to today."),
  category: z.string().optional().describe("Category name — matched case-insensitively against the user's categories."),
  account: z.string().optional().describe("Account name — matched case-insensitively against the user's accounts."),
  description: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional().describe("Expense only."),
  sourceType: z.enum(["salary", "freelance", "rental", "interest", "business", "dividend", "other"]).optional().describe("Income only."),
  ...confirmShape,
};

export async function createTransaction(session: McpSession, args: z.infer<z.ZodObject<typeof createTransactionSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [categoryMap, accountMap] = await Promise.all([loadCategoryMap(session.userId), loadAccountMap(session.userId)]);
  const category = matchByName(args.category, [...categoryMap.entries()].map(([id, v]) => ({ id, name: v.name })));
  const account = matchByName(args.account, [...accountMap.entries()].map(([id, name]) => ({ id, name })));
  if (args.category && !category) return { error: `No category named "${args.category}" found.` };
  if (args.account && !account) return { error: `No account named "${args.account}" found.` };

  const date = args.date ?? new Date().toISOString().slice(0, 10);
  const plan = {
    kind: args.kind,
    amount: args.amount,
    date,
    category: category?.name ?? null,
    account: account?.name ?? null,
    description: args.description ?? null,
    note: args.kind === "expense" ? args.note ?? null : undefined,
    sourceType: args.kind === "income" ? args.sourceType ?? "other" : undefined,
  };
  if (!args.confirm) return preview("create_transaction", plan);

  const currency = await getBaseCurrency(session.userId);
  const amount = await encryptPacked(String(args.amount), session.dek);
  const description = args.description ? await encryptPacked(args.description, session.dek) : null;

  if (args.kind === "income") {
    const [row] = await db
      .insert(schema.income)
      .values({
        userId: session.userId,
        amount,
        currency,
        description,
        categoryId: category?.id ?? null,
        accountId: account?.id ?? null,
        receivedAt: date,
        sourceType: args.sourceType ?? "other",
      })
      .returning({ id: schema.income.id });
    return { status: "done", id: row.id, ...plan };
  }

  const note = args.note ? await encryptPacked(args.note, session.dek) : null;
  const [row] = await db
    .insert(schema.expenses)
    .values({
      userId: session.userId,
      amount,
      currency,
      description,
      note,
      categoryId: category?.id ?? null,
      accountId: account?.id ?? null,
      spentAt: date,
    })
    .returning({ id: schema.expenses.id });
  return { status: "done", id: row.id, ...plan };
}

export const deleteTransactionSchema = {
  id: z.string().uuid(),
  kind: z.enum(["income", "expense"]),
  ...confirmShape,
};

export async function deleteTransaction(session: McpSession, args: z.infer<z.ZodObject<typeof deleteTransactionSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const table = args.kind === "income" ? schema.income : schema.expenses;
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, args.id), eq(table.userId, session.userId), isNull(table.deletedAt)))
    .limit(1);
  if (!row) return { error: `No ${args.kind} transaction with that id.` };

  const amount = await decryptOrNull(row.amount, session.dek);
  const plan = { id: args.id, kind: args.kind, amount, date: args.kind === "income" ? (row as typeof schema.income.$inferSelect).receivedAt : (row as typeof schema.expenses.$inferSelect).spentAt };
  if (!args.confirm) return preview("delete_transaction", plan);

  await db.update(table).set({ deletedAt: new Date() }).where(and(eq(table.id, args.id), eq(table.userId, session.userId)));
  return { status: "done", ...plan };
}

/* ----------------------------------------------------------------------- */
/* Budgets                                                                 */
/* ----------------------------------------------------------------------- */

export const createBudgetSchema = {
  category: z.string().optional().describe("Category name. Omit for an overall budget covering all spending."),
  period: z.enum(["weekly", "monthly", "yearly"]).default("monthly"),
  amount: z.number().positive().max(1_000_000_000),
  startsOn: dateShape.describe("ISO date. Defaults to today."),
  ...confirmShape,
};

export async function createBudget(session: McpSession, args: z.infer<z.ZodObject<typeof createBudgetSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const categoryMap = await loadCategoryMap(session.userId);
  const category = matchByName(args.category, [...categoryMap.entries()].map(([id, v]) => ({ id, name: v.name })));
  if (args.category && !category) return { error: `No category named "${args.category}" found.` };

  const startsOn = args.startsOn ?? new Date().toISOString().slice(0, 10);
  const plan = { category: category?.name ?? "Overall", period: args.period, amount: args.amount, startsOn };
  if (!args.confirm) return preview("create_budget", plan);

  const currency = await getBaseCurrency(session.userId);
  const amount = await encryptPacked(String(args.amount), session.dek);
  const [row] = await db
    .insert(schema.budgets)
    .values({ userId: session.userId, categoryId: category?.id ?? null, period: args.period, amount, currency, startsOn })
    .returning({ id: schema.budgets.id });
  return { status: "done", id: row.id, ...plan };
}

export const deleteBudgetSchema = { id: z.string().uuid(), ...confirmShape };

export async function deleteBudget(session: McpSession, args: z.infer<z.ZodObject<typeof deleteBudgetSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.budgets)
    .where(and(eq(schema.budgets.id, args.id), eq(schema.budgets.userId, session.userId), isNull(schema.budgets.deletedAt)))
    .limit(1);
  if (!row) return { error: "No budget with that id." };

  const categoryMap = await loadCategoryMap(session.userId);
  const amount = await decryptOrNull(row.amount, session.dek);
  const plan = { id: args.id, category: row.categoryId ? categoryMap.get(row.categoryId)?.name ?? null : "Overall", period: row.period, amount };
  if (!args.confirm) return preview("delete_budget", plan);

  await db.update(schema.budgets).set({ deletedAt: new Date() }).where(and(eq(schema.budgets.id, args.id), eq(schema.budgets.userId, session.userId)));
  return { status: "done", ...plan };
}

/* ----------------------------------------------------------------------- */
/* Goals                                                                    */
/* ----------------------------------------------------------------------- */

export const createGoalSchema = {
  name: z.string().trim().min(1).max(80),
  targetAmount: z.number().positive().max(1_000_000_000),
  currentAmount: z.number().min(0).max(1_000_000_000).default(0),
  deadline: dateShape.optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  monthlyContribution: z.number().min(0).max(1_000_000_000).optional(),
  ...confirmShape,
};

export async function createGoal(session: McpSession, args: z.infer<z.ZodObject<typeof createGoalSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const status = args.currentAmount >= args.targetAmount ? "completed" : "active";
  const plan = { name: args.name, targetAmount: args.targetAmount, currentAmount: args.currentAmount, deadline: args.deadline ?? null, priority: args.priority, monthlyContribution: args.monthlyContribution ?? null, goalStatus: status };
  if (!args.confirm) return preview("create_goal", plan);

  const currency = await getBaseCurrency(session.userId);
  const [targetAmount, currentAmount, monthlyContribution] = await Promise.all([
    encryptPacked(String(args.targetAmount), session.dek),
    encryptPacked(String(args.currentAmount), session.dek),
    args.monthlyContribution != null ? encryptPacked(String(args.monthlyContribution), session.dek) : Promise.resolve(null),
  ]);
  const [row] = await db
    .insert(schema.goals)
    .values({ userId: session.userId, name: args.name, targetAmount, currentAmount, currency, deadline: args.deadline ?? null, priority: args.priority, monthlyContribution, status })
    .returning({ id: schema.goals.id });
  return { status: "done", id: row.id, ...plan };
}

export const deleteGoalSchema = { id: z.string().uuid(), ...confirmShape };

export async function deleteGoal(session: McpSession, args: z.infer<z.ZodObject<typeof deleteGoalSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.id, args.id), eq(schema.goals.userId, session.userId), isNull(schema.goals.deletedAt)))
    .limit(1);
  if (!row) return { error: "No goal with that id." };

  const plan = { id: args.id, name: row.name, currentAmount: await decryptOrNull(row.currentAmount, session.dek), targetAmount: await decryptOrNull(row.targetAmount, session.dek) };
  if (!args.confirm) return preview("delete_goal", plan);

  await db.update(schema.goals).set({ deletedAt: new Date() }).where(and(eq(schema.goals.id, args.id), eq(schema.goals.userId, session.userId)));
  return { status: "done", ...plan };
}

export const addGoalContributionSchema = {
  goalId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000_000),
  contributedAt: dateShape.optional().describe("ISO date. Defaults to today."),
  note: z.string().trim().max(200).optional(),
  ...confirmShape,
};

export async function addGoalContribution(session: McpSession, args: z.infer<z.ZodObject<typeof addGoalContributionSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [goal] = await db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.id, args.goalId), eq(schema.goals.userId, session.userId), isNull(schema.goals.deletedAt)))
    .limit(1);
  if (!goal) return { error: "No goal with that id." };

  const currentAmount = (await decryptOrNull(goal.currentAmount, session.dek)) ?? 0;
  const targetAmount = (await decryptOrNull(goal.targetAmount, session.dek)) ?? 0;
  const newCurrentAmount = currentAmount + args.amount;
  const newStatus = newCurrentAmount >= targetAmount ? "completed" : "active";
  const contributedAt = args.contributedAt ?? new Date().toISOString().slice(0, 10);

  const plan = { goal: goal.name, contribution: args.amount, previousAmount: currentAmount, newAmount: newCurrentAmount, targetAmount, newStatus, contributedAt };
  if (!args.confirm) return preview("add_goal_contribution", plan);

  const [amount, newCurrentAmountEnc] = await Promise.all([
    encryptPacked(String(args.amount), session.dek),
    encryptPacked(String(newCurrentAmount), session.dek),
  ]);
  const note = args.note ? await encryptPacked(args.note, session.dek) : null;

  await db.insert(schema.goalContributions).values({ goalId: args.goalId, userId: session.userId, amount, contributedAt, note });
  await db
    .update(schema.goals)
    .set({ currentAmount: newCurrentAmountEnc, status: newStatus })
    .where(and(eq(schema.goals.id, args.goalId), eq(schema.goals.userId, session.userId)));
  return { status: "done", ...plan };
}

/* ----------------------------------------------------------------------- */
/* Loans                                                                    */
/* ----------------------------------------------------------------------- */

export const createLoanSchema = {
  name: z.string().trim().min(1).max(80),
  type: z.enum(["home", "car", "personal", "education", "credit_card", "other"]).default("personal"),
  principal: z.number().positive().max(1_000_000_000),
  interestRate: z.number().min(0).max(100),
  emi: z.number().positive().max(1_000_000_000),
  remainingAmount: z.number().min(0).max(1_000_000_000),
  remainingMonths: z.number().int().min(0).optional(),
  extraEmi: z.number().min(0).optional(),
  startDate: dateShape.optional().describe("ISO date. Defaults to today."),
  ...confirmShape,
};

export async function createLoan(session: McpSession, args: z.infer<z.ZodObject<typeof createLoanSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const startDate = args.startDate ?? new Date().toISOString().slice(0, 10);
  const plan = { name: args.name, type: args.type, principal: args.principal, interestRate: args.interestRate, emi: args.emi, remainingAmount: args.remainingAmount, remainingMonths: args.remainingMonths ?? null, extraEmi: args.extraEmi ?? null, startDate };
  if (!args.confirm) return preview("create_loan", plan);

  const currency = await getBaseCurrency(session.userId);
  const [principal, emi, remainingAmount, extraEmi] = await Promise.all([
    encryptPacked(String(args.principal), session.dek),
    encryptPacked(String(args.emi), session.dek),
    encryptPacked(String(args.remainingAmount), session.dek),
    args.extraEmi != null ? encryptPacked(String(args.extraEmi), session.dek) : Promise.resolve(null),
  ]);
  const [row] = await db
    .insert(schema.loans)
    .values({
      userId: session.userId,
      name: args.name,
      type: args.type,
      principal,
      interestRate: String(args.interestRate),
      emi,
      remainingAmount,
      remainingMonths: args.remainingMonths ?? null,
      extraEmi,
      currency,
      startDate,
    })
    .returning({ id: schema.loans.id });
  return { status: "done", id: row.id, ...plan };
}

export const deleteLoanSchema = { id: z.string().uuid(), ...confirmShape };

export async function deleteLoan(session: McpSession, args: z.infer<z.ZodObject<typeof deleteLoanSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.loans)
    .where(and(eq(schema.loans.id, args.id), eq(schema.loans.userId, session.userId), isNull(schema.loans.deletedAt)))
    .limit(1);
  if (!row) return { error: "No loan with that id." };

  const plan = { id: args.id, name: row.name, remainingAmount: await decryptOrNull(row.remainingAmount, session.dek) };
  if (!args.confirm) return preview("delete_loan", plan);

  await db.update(schema.loans).set({ deletedAt: new Date() }).where(and(eq(schema.loans.id, args.id), eq(schema.loans.userId, session.userId)));
  return { status: "done", ...plan };
}

export const recordLoanPaymentSchema = {
  loanId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000_000),
  paidOn: dateShape.optional().describe("ISO date. Defaults to today."),
  isExtra: z.boolean().default(false).describe("An extra/prepayment goes entirely to principal and doesn't advance the remaining-months count."),
  ...confirmShape,
};

/** Mirrors loans/client-actions.ts's `encryptedRecordPayment` split exactly
 * (same monthly-rate interest calc, same principal/months bookkeeping) — see
 * that file's comment for why this arithmetic has to happen wherever the
 * DEK is available, since the server can't read stored ciphertext to do it
 * itself. */
export async function recordLoanPayment(session: McpSession, args: z.infer<z.ZodObject<typeof recordLoanPaymentSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [loan] = await db
    .select()
    .from(schema.loans)
    .where(and(eq(schema.loans.id, args.loanId), eq(schema.loans.userId, session.userId), isNull(schema.loans.deletedAt)))
    .limit(1);
  if (!loan) return { error: "No loan with that id." };

  const balance = (await decryptOrNull(loan.remainingAmount, session.dek)) ?? 0;
  const interestRate = Number(loan.interestRate);
  const monthlyRate = interestRate / 100 / 12;
  const interestComponentValue = args.isExtra ? 0 : Math.min(args.amount, balance * monthlyRate);
  const principalComponentValue = Math.min(balance, args.amount - interestComponentValue);
  const newBalance = Math.max(0, balance - principalComponentValue);
  const newRemainingMonths = !args.isExtra && loan.remainingMonths != null ? Math.max(0, loan.remainingMonths - 1) : loan.remainingMonths;
  const paidOn = args.paidOn ?? new Date().toISOString().slice(0, 10);

  const plan = { loan: loan.name, payment: args.amount, principalComponent: principalComponentValue, interestComponent: interestComponentValue, previousBalance: balance, newBalance, newRemainingMonths, paidOn, isExtra: args.isExtra };
  if (!args.confirm) return preview("record_loan_payment", plan);

  const [amount, principalComponent, interestComponent, newRemainingAmount] = await Promise.all([
    encryptPacked(String(args.amount), session.dek),
    encryptPacked(String(principalComponentValue), session.dek),
    encryptPacked(String(interestComponentValue), session.dek),
    encryptPacked(String(newBalance), session.dek),
  ]);

  await db.insert(schema.loanPayments).values({ loanId: args.loanId, userId: session.userId, amount, principalComponent, interestComponent, paidOn, isExtra: args.isExtra });
  await db
    .update(schema.loans)
    .set({ remainingAmount: newRemainingAmount, remainingMonths: newRemainingMonths ?? null })
    .where(and(eq(schema.loans.id, args.loanId), eq(schema.loans.userId, session.userId)));
  return { status: "done", ...plan };
}

/* ----------------------------------------------------------------------- */
/* Investments                                                             */
/* ----------------------------------------------------------------------- */

export const createInvestmentSchema = {
  name: z.string().trim().min(1).max(80),
  type: z.enum(["stocks", "mutual_fund", "etf", "bonds", "crypto", "real_estate", "gold", "retirement", "other"]).default("stocks"),
  investedAmount: z.number().min(0).max(1_000_000_000),
  currentValue: z.number().min(0).max(1_000_000_000),
  monthlyContribution: z.number().min(0).max(1_000_000_000).optional(),
  expectedReturn: z.number().min(0).max(100),
  startDate: dateShape.optional().describe("ISO date. Defaults to today."),
  ...confirmShape,
};

export async function createInvestment(session: McpSession, args: z.infer<z.ZodObject<typeof createInvestmentSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const startDate = args.startDate ?? new Date().toISOString().slice(0, 10);
  const plan = { name: args.name, type: args.type, investedAmount: args.investedAmount, currentValue: args.currentValue, monthlyContribution: args.monthlyContribution ?? null, expectedReturn: args.expectedReturn, startDate };
  if (!args.confirm) return preview("create_investment", plan);

  const currency = await getBaseCurrency(session.userId);
  const [investedAmount, currentValue, monthlyContribution] = await Promise.all([
    encryptPacked(String(args.investedAmount), session.dek),
    encryptPacked(String(args.currentValue), session.dek),
    args.monthlyContribution != null ? encryptPacked(String(args.monthlyContribution), session.dek) : Promise.resolve(null),
  ]);
  const [row] = await db
    .insert(schema.investments)
    .values({
      userId: session.userId,
      name: args.name,
      type: args.type,
      investedAmount,
      currentValue,
      monthlyContribution,
      expectedReturn: String(args.expectedReturn),
      currency,
      startDate,
    })
    .returning({ id: schema.investments.id });
  return { status: "done", id: row.id, ...plan };
}

export const deleteInvestmentSchema = { id: z.string().uuid(), ...confirmShape };

export async function deleteInvestment(session: McpSession, args: z.infer<z.ZodObject<typeof deleteInvestmentSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.investments)
    .where(and(eq(schema.investments.id, args.id), eq(schema.investments.userId, session.userId), isNull(schema.investments.deletedAt)))
    .limit(1);
  if (!row) return { error: "No investment with that id." };

  const plan = { id: args.id, name: row.name, currentValue: await decryptOrNull(row.currentValue, session.dek) };
  if (!args.confirm) return preview("delete_investment", plan);

  await db.update(schema.investments).set({ deletedAt: new Date() }).where(and(eq(schema.investments.id, args.id), eq(schema.investments.userId, session.userId)));
  return { status: "done", ...plan };
}

export const recordInvestmentContributionSchema = {
  investmentId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000_000),
  addToValue: z.boolean().default(true).describe("Also bump the holding's current market value by the same amount (a fresh buy), vs. false for a cost-basis-only adjustment."),
  contributedAt: dateShape.optional().describe("ISO date. Defaults to today."),
  ...confirmShape,
};

export async function recordInvestmentContribution(session: McpSession, args: z.infer<z.ZodObject<typeof recordInvestmentContributionSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [investment] = await db
    .select()
    .from(schema.investments)
    .where(and(eq(schema.investments.id, args.investmentId), eq(schema.investments.userId, session.userId), isNull(schema.investments.deletedAt)))
    .limit(1);
  if (!investment) return { error: "No investment with that id." };

  const investedAmount = (await decryptOrNull(investment.investedAmount, session.dek)) ?? 0;
  const currentValue = (await decryptOrNull(investment.currentValue, session.dek)) ?? 0;
  const newInvested = investedAmount + args.amount;
  const newValue = currentValue + (args.addToValue ? args.amount : 0);
  const contributedAt = args.contributedAt ?? new Date().toISOString().slice(0, 10);

  const plan = { investment: investment.name, contribution: args.amount, previousInvestedAmount: investedAmount, newInvestedAmount: newInvested, previousCurrentValue: currentValue, newCurrentValue: newValue, contributedAt };
  if (!args.confirm) return preview("record_investment_contribution", plan);

  const [amount, newInvestedAmount, newCurrentValue] = await Promise.all([
    encryptPacked(String(args.amount), session.dek),
    encryptPacked(String(newInvested), session.dek),
    encryptPacked(String(newValue), session.dek),
  ]);

  await db.insert(schema.investmentContributions).values({ investmentId: args.investmentId, userId: session.userId, amount, contributedAt });
  await db
    .update(schema.investments)
    .set({ investedAmount: newInvestedAmount, currentValue: newCurrentValue })
    .where(and(eq(schema.investments.id, args.investmentId), eq(schema.investments.userId, session.userId)));
  return { status: "done", ...plan };
}

/* ----------------------------------------------------------------------- */
/* Recurring rules                                                         */
/* ----------------------------------------------------------------------- */

export const createRecurringRuleSchema = {
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["income", "expense"]).default("expense"),
  category: z.string().optional(),
  account: z.string().optional(),
  amount: z.number().positive().max(1_000_000_000),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).default("monthly"),
  interval: z.number().int().min(1).max(365).default(1),
  startDate: dateShape.optional().describe("ISO date. Defaults to today."),
  endDate: dateShape.optional(),
  isActive: z.boolean().default(true),
  note: z.string().trim().max(500).optional(),
  ...confirmShape,
};

export async function createRecurringRule(session: McpSession, args: z.infer<z.ZodObject<typeof createRecurringRuleSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [categoryMap, accountMap] = await Promise.all([loadCategoryMap(session.userId), loadAccountMap(session.userId)]);
  const category = matchByName(args.category, [...categoryMap.entries()].map(([id, v]) => ({ id, name: v.name })));
  const account = matchByName(args.account, [...accountMap.entries()].map(([id, name]) => ({ id, name })));
  if (args.category && !category) return { error: `No category named "${args.category}" found.` };
  if (args.account && !account) return { error: `No account named "${args.account}" found.` };
  const startDate = args.startDate ?? new Date().toISOString().slice(0, 10);
  if (args.endDate && args.endDate < startDate) return { error: "End date can't be before the start date." };

  const plan = { name: args.name, kind: args.kind, category: category?.name ?? null, account: account?.name ?? null, amount: args.amount, frequency: args.frequency, interval: args.interval, startDate, endDate: args.endDate ?? null, isActive: args.isActive, note: args.note ?? null };
  if (!args.confirm) return preview("create_recurring_rule", plan);

  const currency = await getBaseCurrency(session.userId);
  const amount = await encryptPacked(String(args.amount), session.dek);
  const note = args.note ? await encryptPacked(args.note, session.dek) : null;
  const [row] = await db
    .insert(schema.recurringRules)
    .values({
      userId: session.userId,
      name: args.name,
      kind: args.kind,
      categoryId: category?.id ?? null,
      accountId: account?.id ?? null,
      amount,
      currency,
      frequency: args.frequency,
      interval: args.interval,
      startDate,
      endDate: args.endDate ?? null,
      isActive: args.isActive,
      note,
    })
    .returning({ id: schema.recurringRules.id });
  return { status: "done", id: row.id, ...plan };
}

export const toggleRecurringRuleSchema = { id: z.string().uuid(), isActive: z.boolean(), ...confirmShape };

export async function toggleRecurringRule(session: McpSession, args: z.infer<z.ZodObject<typeof toggleRecurringRuleSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.recurringRules)
    .where(and(eq(schema.recurringRules.id, args.id), eq(schema.recurringRules.userId, session.userId), isNull(schema.recurringRules.deletedAt)))
    .limit(1);
  if (!row) return { error: "No recurring rule with that id." };

  const plan = { id: args.id, name: row.name, from: row.isActive, to: args.isActive };
  if (!args.confirm) return preview("toggle_recurring_rule", plan);

  await db.update(schema.recurringRules).set({ isActive: args.isActive }).where(and(eq(schema.recurringRules.id, args.id), eq(schema.recurringRules.userId, session.userId)));
  return { status: "done", ...plan };
}

export const deleteRecurringRuleSchema = { id: z.string().uuid(), ...confirmShape };

export async function deleteRecurringRule(session: McpSession, args: z.infer<z.ZodObject<typeof deleteRecurringRuleSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.recurringRules)
    .where(and(eq(schema.recurringRules.id, args.id), eq(schema.recurringRules.userId, session.userId), isNull(schema.recurringRules.deletedAt)))
    .limit(1);
  if (!row) return { error: "No recurring rule with that id." };

  const plan = { id: args.id, name: row.name, amount: await decryptOrNull(row.amount, session.dek) };
  if (!args.confirm) return preview("delete_recurring_rule", plan);

  await db.update(schema.recurringRules).set({ deletedAt: new Date() }).where(and(eq(schema.recurringRules.id, args.id), eq(schema.recurringRules.userId, session.userId)));
  return { status: "done", ...plan };
}

/* ----------------------------------------------------------------------- */
/* Collections (Splitwise-style contribution pools)                        */
/* ----------------------------------------------------------------------- */

export const createCollectionSchema = {
  title: z.string().trim().min(1).max(80),
  purpose: z.string().trim().max(200).optional(),
  targetAmount: z.number().positive().max(1_000_000_000).optional().describe("Omit if there's no fixed target."),
  eventDate: dateShape.optional(),
  ...confirmShape,
};

export async function createCollection(session: McpSession, args: z.infer<z.ZodObject<typeof createCollectionSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const plan = { title: args.title, purpose: args.purpose ?? null, targetAmount: args.targetAmount ?? null, eventDate: args.eventDate ?? null };
  if (!args.confirm) return preview("create_collection", plan);

  const currency = await getBaseCurrency(session.userId);
  const targetAmount = args.targetAmount != null ? await encryptPacked(String(args.targetAmount), session.dek) : null;
  const [row] = await db
    .insert(schema.collections)
    .values({
      userId: session.userId,
      title: args.title,
      purpose: args.purpose ?? null,
      targetAmount,
      currency,
      eventDate: args.eventDate ?? null,
      status: "open",
    })
    .returning({ id: schema.collections.id });
  return { status: "done", id: row.id, ...plan };
}

export const updateCollectionSchema = {
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80).optional(),
  purpose: z.string().trim().max(200).optional().describe("Pass an empty string to clear it."),
  targetAmount: z.number().min(0).max(1_000_000_000).optional(),
  eventDate: dateShape.optional(),
  status: z.enum(["open", "closed"]).optional(),
  ...confirmShape,
};

export async function updateCollection(session: McpSession, args: z.infer<z.ZodObject<typeof updateCollectionSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.collections)
    .where(and(eq(schema.collections.id, args.id), eq(schema.collections.userId, session.userId), isNull(schema.collections.deletedAt)))
    .limit(1);
  if (!row) return { error: "No collection with that id." };

  const currentTarget = await decryptOrNull(row.targetAmount, session.dek);
  const newTarget = args.targetAmount !== undefined ? args.targetAmount : currentTarget;
  const newTitle = args.title ?? row.title;
  const newPurpose = args.purpose !== undefined ? (args.purpose === "" ? null : args.purpose) : row.purpose;
  const newEventDate = args.eventDate ?? row.eventDate;
  const newStatus = args.status ?? row.status;

  const plan = {
    id: args.id,
    title: { from: row.title, to: newTitle },
    purpose: { from: row.purpose, to: newPurpose },
    targetAmount: { from: currentTarget, to: newTarget },
    eventDate: { from: row.eventDate, to: newEventDate },
    collectionStatus: { from: row.status, to: newStatus },
  };
  if (!args.confirm) return preview("update_collection", plan);

  const targetAmount = newTarget != null ? await encryptPacked(String(newTarget), session.dek) : null;
  await db
    .update(schema.collections)
    .set({ title: newTitle, purpose: newPurpose, targetAmount, eventDate: newEventDate, status: newStatus })
    .where(and(eq(schema.collections.id, args.id), eq(schema.collections.userId, session.userId)));
  return { status: "done", ...plan };
}

export const deleteCollectionSchema = { id: z.string().uuid(), ...confirmShape };

export async function deleteCollection(session: McpSession, args: z.infer<z.ZodObject<typeof deleteCollectionSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.collections)
    .where(and(eq(schema.collections.id, args.id), eq(schema.collections.userId, session.userId), isNull(schema.collections.deletedAt)))
    .limit(1);
  if (!row) return { error: "No collection with that id." };

  const plan = { id: args.id, title: row.title };
  if (!args.confirm) return preview("delete_collection", plan);

  await db.update(schema.collections).set({ deletedAt: new Date() }).where(and(eq(schema.collections.id, args.id), eq(schema.collections.userId, session.userId)));
  return { status: "done", ...plan };
}

/** Case-insensitive match against a collection's already-decrypted roster,
 * or creates a new participant — an MCP call has `session.dek` available
 * server-side (unlike the browser Smart Entry path, which has to defer
 * this to client-commit.ts), so name matching can happen right here. */
async function resolveOrCreateParticipant(
  session: McpSession,
  collectionId: string,
  name: string,
): Promise<{ id: string; displayName: string }> {
  const rows = await db!
    .select()
    .from(schema.collectionParticipants)
    .where(
      and(
        eq(schema.collectionParticipants.collectionId, collectionId),
        eq(schema.collectionParticipants.userId, session.userId),
        isNull(schema.collectionParticipants.deletedAt),
      ),
    );
  const norm = name.trim().toLowerCase();
  for (const r of rows) {
    const decrypted = await decryptStrOrNull(r.displayName, session.dek);
    if (decrypted && decrypted.trim().toLowerCase() === norm) return { id: r.id, displayName: decrypted };
  }
  const displayName = await encryptPacked(name, session.dek);
  const [row] = await db!
    .insert(schema.collectionParticipants)
    .values({ collectionId, userId: session.userId, displayName })
    .returning({ id: schema.collectionParticipants.id });
  return { id: row.id, displayName: name };
}

export const addCollectionContributionSchema = {
  collectionId: z.string().uuid(),
  contributorName: z.string().trim().min(1).max(80).describe("Matched against the collection's roster, or added to it."),
  amount: z.number().positive().max(1_000_000_000),
  contributedAt: dateShape.optional().describe("ISO date. Defaults to today."),
  method: z.string().trim().max(40).optional(),
  ...confirmShape,
};

export async function addCollectionContribution(session: McpSession, args: z.infer<z.ZodObject<typeof addCollectionContributionSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [collection] = await db
    .select()
    .from(schema.collections)
    .where(and(eq(schema.collections.id, args.collectionId), eq(schema.collections.userId, session.userId), isNull(schema.collections.deletedAt)))
    .limit(1);
  if (!collection) return { error: "No collection with that id." };
  if (collection.status === "closed") return { error: "This collection is closed." };

  const contributedAt = args.contributedAt ?? new Date().toISOString().slice(0, 10);
  const plan = { collection: collection.title, contributor: args.contributorName, amount: args.amount, contributedAt, method: args.method ?? null };
  if (!args.confirm) return preview("add_collection_contribution", plan);

  const participant = await resolveOrCreateParticipant(session, args.collectionId, args.contributorName);
  const amount = await encryptPacked(String(args.amount), session.dek);
  await db.insert(schema.collectionContributions).values({
    collectionId: args.collectionId,
    userId: session.userId,
    participantId: participant.id,
    amount,
    contributedAt,
    method: args.method ?? null,
  });
  return { status: "done", ...plan };
}

export const addCollectionExpenseSchema = {
  collectionId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000_000),
  description: z.string().trim().max(200).optional().describe("What it was spent on."),
  category: z.string().optional().describe("Category name — matched case-insensitively against the user's categories."),
  spentAt: dateShape.optional().describe("ISO date. Defaults to today."),
  linkToTransaction: z.boolean().default(false).describe("Also log this as a real expense transaction."),
  ...confirmShape,
};

/** Money spent out of a collection's pool — plural, doesn't close the
 * collection (that's a separate `update_collection` status change). */
export async function addCollectionExpense(session: McpSession, args: z.infer<z.ZodObject<typeof addCollectionExpenseSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [collection] = await db
    .select()
    .from(schema.collections)
    .where(and(eq(schema.collections.id, args.collectionId), eq(schema.collections.userId, session.userId), isNull(schema.collections.deletedAt)))
    .limit(1);
  if (!collection) return { error: "No collection with that id." };
  if (collection.status === "closed") return { error: "This collection is closed." };

  const categoryMap = await loadCategoryMap(session.userId);
  const category = matchByName(args.category, [...categoryMap.entries()].map(([id, v]) => ({ id, name: v.name })));
  if (args.category && !category) return { error: `No category named "${args.category}" found.` };

  const spentAt = args.spentAt ?? new Date().toISOString().slice(0, 10);
  const plan = { collection: collection.title, amount: args.amount, description: args.description ?? null, category: category?.name ?? null, spentAt, linkToTransaction: args.linkToTransaction };
  if (!args.confirm) return preview("add_collection_expense", plan);

  let linkedTransactionId: string | null = null;
  if (args.linkToTransaction) {
    const currency = await getBaseCurrency(session.userId);
    const amount = await encryptPacked(String(args.amount), session.dek);
    const description = args.description ? await encryptPacked(args.description, session.dek) : null;
    const [expenseRow] = await db
      .insert(schema.expenses)
      .values({ userId: session.userId, amount, currency, description, categoryId: category?.id ?? null, spentAt })
      .returning({ id: schema.expenses.id });
    linkedTransactionId = expenseRow.id;
  }

  const amount = await encryptPacked(String(args.amount), session.dek);
  const description = args.description ? await encryptPacked(args.description, session.dek) : null;
  await db.insert(schema.collectionExpenses).values({
    collectionId: args.collectionId,
    userId: session.userId,
    amount,
    description,
    categoryId: category?.id ?? null,
    spentAt,
    linkedTransactionId,
  });
  return { status: "done", ...plan };
}

/* ----------------------------------------------------------------------- */
/* Updates — every field optional; only what's provided changes.          */
/* ----------------------------------------------------------------------- */

export const updateTransactionSchema = {
  id: z.string().uuid(),
  kind: z.enum(["income", "expense"]),
  amount: z.number().positive().max(1_000_000_000).optional(),
  date: dateShape.optional(),
  category: z.string().optional(),
  account: z.string().optional(),
  description: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional().describe("Expense only."),
  sourceType: z.enum(["salary", "freelance", "rental", "interest", "business", "dividend", "other"]).optional().describe("Income only."),
  ...confirmShape,
};

export async function updateTransaction(session: McpSession, args: z.infer<z.ZodObject<typeof updateTransactionSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const table = args.kind === "income" ? schema.income : schema.expenses;
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, args.id), eq(table.userId, session.userId), isNull(table.deletedAt)))
    .limit(1);
  if (!row) return { error: `No ${args.kind} transaction with that id.` };

  const [categoryMap, accountMap] = await Promise.all([loadCategoryMap(session.userId), loadAccountMap(session.userId)]);
  const category = args.category !== undefined ? matchByName(args.category, [...categoryMap.entries()].map(([id, v]) => ({ id, name: v.name }))) : undefined;
  const account = args.account !== undefined ? matchByName(args.account, [...accountMap.entries()].map(([id, name]) => ({ id, name }))) : undefined;
  if (args.category !== undefined && !category) return { error: `No category named "${args.category}" found.` };
  if (args.account !== undefined && !account) return { error: `No account named "${args.account}" found.` };

  const currentAmount = (await decryptOrNull(row.amount, session.dek)) ?? 0;
  const currentDescription = await decryptStrOrNull(row.description, session.dek);
  const isIncome = args.kind === "income";
  const currentNote = !isIncome ? await decryptStrOrNull((row as typeof schema.expenses.$inferSelect).note, session.dek) : null;
  const currentDate = isIncome ? (row as typeof schema.income.$inferSelect).receivedAt : (row as typeof schema.expenses.$inferSelect).spentAt;

  const newAmount = args.amount ?? currentAmount;
  const newDate = args.date ?? currentDate;
  const newDescription = args.description !== undefined ? args.description : currentDescription;
  const newNote = args.note !== undefined ? args.note : currentNote;
  const newCategoryId = category ? category.id : row.categoryId;
  const newAccountId = account ? account.id : row.accountId;
  const newSourceType = isIncome ? args.sourceType ?? (row as typeof schema.income.$inferSelect).sourceType : undefined;

  const plan = {
    id: args.id,
    kind: args.kind,
    amount: { from: currentAmount, to: newAmount },
    date: { from: currentDate, to: newDate },
    category: { from: row.categoryId ? categoryMap.get(row.categoryId)?.name ?? null : null, to: newCategoryId ? categoryMap.get(newCategoryId)?.name ?? null : null },
    account: { from: row.accountId ? accountMap.get(row.accountId) ?? null : null, to: newAccountId ? accountMap.get(newAccountId) ?? null : null },
    description: { from: currentDescription, to: newDescription },
    note: !isIncome ? { from: currentNote, to: newNote } : undefined,
    sourceType: isIncome ? newSourceType : undefined,
  };
  if (!args.confirm) return preview("update_transaction", plan);

  const amount = await encryptPacked(String(newAmount), session.dek);
  const description = newDescription ? await encryptPacked(newDescription, session.dek) : null;

  if (isIncome) {
    await db
      .update(schema.income)
      .set({ amount, description, categoryId: newCategoryId, accountId: newAccountId, receivedAt: newDate, sourceType: newSourceType ?? "other" })
      .where(and(eq(schema.income.id, args.id), eq(schema.income.userId, session.userId)));
  } else {
    const note = newNote ? await encryptPacked(newNote, session.dek) : null;
    await db
      .update(schema.expenses)
      .set({ amount, description, note, categoryId: newCategoryId, accountId: newAccountId, spentAt: newDate })
      .where(and(eq(schema.expenses.id, args.id), eq(schema.expenses.userId, session.userId)));
  }
  return { status: "done", ...plan };
}

export const updateBudgetSchema = {
  id: z.string().uuid(),
  category: z.string().optional().describe("Pass an empty string to make it an overall budget."),
  period: z.enum(["weekly", "monthly", "yearly"]).optional(),
  amount: z.number().positive().max(1_000_000_000).optional(),
  startsOn: dateShape.optional(),
  ...confirmShape,
};

export async function updateBudget(session: McpSession, args: z.infer<z.ZodObject<typeof updateBudgetSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.budgets)
    .where(and(eq(schema.budgets.id, args.id), eq(schema.budgets.userId, session.userId), isNull(schema.budgets.deletedAt)))
    .limit(1);
  if (!row) return { error: "No budget with that id." };

  const categoryMap = await loadCategoryMap(session.userId);
  const category =
    args.category !== undefined
      ? args.category === ""
        ? null
        : matchByName(args.category, [...categoryMap.entries()].map(([id, v]) => ({ id, name: v.name })))
      : undefined;
  if (args.category && category === null && args.category !== "") return { error: `No category named "${args.category}" found.` };

  const currentAmount = (await decryptOrNull(row.amount, session.dek)) ?? 0;
  const newAmount = args.amount ?? currentAmount;
  const newCategoryId = category !== undefined ? (category?.id ?? null) : row.categoryId;
  const newPeriod = args.period ?? row.period;
  const newStartsOn = args.startsOn ?? row.startsOn;

  const plan = {
    id: args.id,
    category: { from: row.categoryId ? categoryMap.get(row.categoryId)?.name ?? null : "Overall", to: newCategoryId ? categoryMap.get(newCategoryId)?.name ?? null : "Overall" },
    period: { from: row.period, to: newPeriod },
    amount: { from: currentAmount, to: newAmount },
    startsOn: { from: row.startsOn, to: newStartsOn },
  };
  if (!args.confirm) return preview("update_budget", plan);

  const amount = await encryptPacked(String(newAmount), session.dek);
  await db
    .update(schema.budgets)
    .set({ categoryId: newCategoryId, period: newPeriod, amount, startsOn: newStartsOn })
    .where(and(eq(schema.budgets.id, args.id), eq(schema.budgets.userId, session.userId)));
  return { status: "done", ...plan };
}

export const updateGoalSchema = {
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  targetAmount: z.number().positive().max(1_000_000_000).optional(),
  currentAmount: z.number().min(0).max(1_000_000_000).optional(),
  deadline: dateShape.optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  monthlyContribution: z.number().min(0).max(1_000_000_000).optional(),
  ...confirmShape,
};

export async function updateGoal(session: McpSession, args: z.infer<z.ZodObject<typeof updateGoalSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.id, args.id), eq(schema.goals.userId, session.userId), isNull(schema.goals.deletedAt)))
    .limit(1);
  if (!row) return { error: "No goal with that id." };

  const currentTarget = (await decryptOrNull(row.targetAmount, session.dek)) ?? 0;
  const currentCurrent = (await decryptOrNull(row.currentAmount, session.dek)) ?? 0;
  const currentMonthly = await decryptOrNull(row.monthlyContribution, session.dek);

  const newTarget = args.targetAmount ?? currentTarget;
  const newCurrent = args.currentAmount ?? currentCurrent;
  const newMonthly = args.monthlyContribution !== undefined ? args.monthlyContribution : currentMonthly;
  const newStatus = newCurrent >= newTarget ? "completed" : row.status === "completed" ? "active" : row.status;
  const newName = args.name ?? row.name;
  const newDeadline = args.deadline !== undefined ? args.deadline : row.deadline;
  const newPriority = args.priority ?? row.priority;

  const plan = {
    id: args.id,
    name: { from: row.name, to: newName },
    targetAmount: { from: currentTarget, to: newTarget },
    currentAmount: { from: currentCurrent, to: newCurrent },
    monthlyContribution: { from: currentMonthly, to: newMonthly },
    deadline: { from: row.deadline, to: newDeadline },
    priority: { from: row.priority, to: newPriority },
    goalStatus: { from: row.status, to: newStatus },
  };
  if (!args.confirm) return preview("update_goal", plan);

  const [targetAmount, currentAmount, monthlyContribution] = await Promise.all([
    encryptPacked(String(newTarget), session.dek),
    encryptPacked(String(newCurrent), session.dek),
    newMonthly != null ? encryptPacked(String(newMonthly), session.dek) : Promise.resolve(null),
  ]);
  await db
    .update(schema.goals)
    .set({ name: newName, targetAmount, currentAmount, monthlyContribution, deadline: newDeadline, priority: newPriority, status: newStatus })
    .where(and(eq(schema.goals.id, args.id), eq(schema.goals.userId, session.userId)));
  return { status: "done", ...plan };
}

export const updateLoanSchema = {
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  type: z.enum(["home", "car", "personal", "education", "credit_card", "other"]).optional(),
  principal: z.number().positive().max(1_000_000_000).optional(),
  interestRate: z.number().min(0).max(100).optional(),
  emi: z.number().positive().max(1_000_000_000).optional(),
  remainingAmount: z.number().min(0).max(1_000_000_000).optional(),
  remainingMonths: z.number().int().min(0).optional(),
  extraEmi: z.number().min(0).optional(),
  ...confirmShape,
};

export async function updateLoan(session: McpSession, args: z.infer<z.ZodObject<typeof updateLoanSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.loans)
    .where(and(eq(schema.loans.id, args.id), eq(schema.loans.userId, session.userId), isNull(schema.loans.deletedAt)))
    .limit(1);
  if (!row) return { error: "No loan with that id." };

  const currentPrincipal = (await decryptOrNull(row.principal, session.dek)) ?? 0;
  const currentEmi = (await decryptOrNull(row.emi, session.dek)) ?? 0;
  const currentRemaining = (await decryptOrNull(row.remainingAmount, session.dek)) ?? 0;
  const currentExtraEmi = await decryptOrNull(row.extraEmi, session.dek);

  const newPrincipal = args.principal ?? currentPrincipal;
  const newEmi = args.emi ?? currentEmi;
  const newRemaining = args.remainingAmount ?? currentRemaining;
  const newExtraEmi = args.extraEmi !== undefined ? args.extraEmi : currentExtraEmi;
  const newName = args.name ?? row.name;
  const newType = args.type ?? row.type;
  const newRate = args.interestRate ?? Number(row.interestRate);
  const newRemainingMonths = args.remainingMonths !== undefined ? args.remainingMonths : row.remainingMonths;

  const plan = {
    id: args.id,
    name: { from: row.name, to: newName },
    type: { from: row.type, to: newType },
    principal: { from: currentPrincipal, to: newPrincipal },
    interestRate: { from: Number(row.interestRate), to: newRate },
    emi: { from: currentEmi, to: newEmi },
    remainingAmount: { from: currentRemaining, to: newRemaining },
    remainingMonths: { from: row.remainingMonths, to: newRemainingMonths },
    extraEmi: { from: currentExtraEmi, to: newExtraEmi },
  };
  if (!args.confirm) return preview("update_loan", plan);

  const [principal, emi, remainingAmount, extraEmi] = await Promise.all([
    encryptPacked(String(newPrincipal), session.dek),
    encryptPacked(String(newEmi), session.dek),
    encryptPacked(String(newRemaining), session.dek),
    newExtraEmi != null ? encryptPacked(String(newExtraEmi), session.dek) : Promise.resolve(null),
  ]);
  await db
    .update(schema.loans)
    .set({ name: newName, type: newType, principal, interestRate: String(newRate), emi, remainingAmount, remainingMonths: newRemainingMonths, extraEmi })
    .where(and(eq(schema.loans.id, args.id), eq(schema.loans.userId, session.userId)));
  return { status: "done", ...plan };
}

export const updateInvestmentSchema = {
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  type: z.enum(["stocks", "mutual_fund", "etf", "bonds", "crypto", "real_estate", "gold", "retirement", "other"]).optional(),
  investedAmount: z.number().min(0).max(1_000_000_000).optional(),
  currentValue: z.number().min(0).max(1_000_000_000).optional(),
  monthlyContribution: z.number().min(0).max(1_000_000_000).optional(),
  expectedReturn: z.number().min(0).max(100).optional(),
  ...confirmShape,
};

export async function updateInvestment(session: McpSession, args: z.infer<z.ZodObject<typeof updateInvestmentSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.investments)
    .where(and(eq(schema.investments.id, args.id), eq(schema.investments.userId, session.userId), isNull(schema.investments.deletedAt)))
    .limit(1);
  if (!row) return { error: "No investment with that id." };

  const currentInvested = (await decryptOrNull(row.investedAmount, session.dek)) ?? 0;
  const currentValue = (await decryptOrNull(row.currentValue, session.dek)) ?? 0;
  const currentMonthly = await decryptOrNull(row.monthlyContribution, session.dek);

  const newInvested = args.investedAmount ?? currentInvested;
  const newValue = args.currentValue ?? currentValue;
  const newMonthly = args.monthlyContribution !== undefined ? args.monthlyContribution : currentMonthly;
  const newName = args.name ?? row.name;
  const newType = args.type ?? row.type;
  const newReturn = args.expectedReturn ?? Number(row.expectedReturn);

  const plan = {
    id: args.id,
    name: { from: row.name, to: newName },
    type: { from: row.type, to: newType },
    investedAmount: { from: currentInvested, to: newInvested },
    currentValue: { from: currentValue, to: newValue },
    monthlyContribution: { from: currentMonthly, to: newMonthly },
    expectedReturn: { from: Number(row.expectedReturn), to: newReturn },
  };
  if (!args.confirm) return preview("update_investment", plan);

  const [investedAmount, currentValueEnc, monthlyContribution] = await Promise.all([
    encryptPacked(String(newInvested), session.dek),
    encryptPacked(String(newValue), session.dek),
    newMonthly != null ? encryptPacked(String(newMonthly), session.dek) : Promise.resolve(null),
  ]);
  await db
    .update(schema.investments)
    .set({ name: newName, type: newType, investedAmount, currentValue: currentValueEnc, monthlyContribution, expectedReturn: String(newReturn) })
    .where(and(eq(schema.investments.id, args.id), eq(schema.investments.userId, session.userId)));
  return { status: "done", ...plan };
}

export const updateRecurringRuleSchema = {
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  category: z.string().optional().describe("Pass an empty string to clear it."),
  account: z.string().optional().describe("Pass an empty string to clear it."),
  amount: z.number().positive().max(1_000_000_000).optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).optional(),
  interval: z.number().int().min(1).max(365).optional(),
  startDate: dateShape.optional(),
  endDate: dateShape.optional().describe("Pass an empty string to clear it."),
  isActive: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
  ...confirmShape,
};

export async function updateRecurringRule(session: McpSession, args: z.infer<z.ZodObject<typeof updateRecurringRuleSchema>>) {
  const gate = requireWriteAccess(session);
  if (gate) return { error: gate };
  if (!db) return { error: "Database isn't configured in this environment." };

  const [row] = await db
    .select()
    .from(schema.recurringRules)
    .where(and(eq(schema.recurringRules.id, args.id), eq(schema.recurringRules.userId, session.userId), isNull(schema.recurringRules.deletedAt)))
    .limit(1);
  if (!row) return { error: "No recurring rule with that id." };

  const [categoryMap, accountMap] = await Promise.all([loadCategoryMap(session.userId), loadAccountMap(session.userId)]);
  const category =
    args.category !== undefined
      ? args.category === ""
        ? null
        : matchByName(args.category, [...categoryMap.entries()].map(([id, v]) => ({ id, name: v.name })))
      : undefined;
  const account =
    args.account !== undefined
      ? args.account === ""
        ? null
        : matchByName(args.account, [...accountMap.entries()].map(([id, name]) => ({ id, name })))
      : undefined;
  if (args.category && args.category !== "" && category === null) return { error: `No category named "${args.category}" found.` };
  if (args.account && args.account !== "" && account === null) return { error: `No account named "${args.account}" found.` };

  const currentAmount = (await decryptOrNull(row.amount, session.dek)) ?? 0;
  const currentNote = await decryptStrOrNull(row.note, session.dek);
  const newAmount = args.amount ?? currentAmount;
  const newNote = args.note !== undefined ? args.note : currentNote;
  const newStartDate = args.startDate ?? row.startDate;
  const newEndDate = args.endDate !== undefined ? (args.endDate === "" ? null : args.endDate) : row.endDate;
  if (newEndDate && newEndDate < newStartDate) return { error: "End date can't be before the start date." };

  const plan = {
    id: args.id,
    name: { from: row.name, to: args.name ?? row.name },
    category: { from: row.categoryId ? categoryMap.get(row.categoryId)?.name ?? null : null, to: category !== undefined ? category?.name ?? null : row.categoryId ? categoryMap.get(row.categoryId)?.name ?? null : null },
    account: { from: row.accountId ? accountMap.get(row.accountId) ?? null : null, to: account !== undefined ? account?.name ?? null : row.accountId ? accountMap.get(row.accountId) ?? null : null },
    amount: { from: currentAmount, to: newAmount },
    frequency: { from: row.frequency, to: args.frequency ?? row.frequency },
    interval: { from: row.interval, to: args.interval ?? row.interval },
    startDate: { from: row.startDate, to: newStartDate },
    endDate: { from: row.endDate, to: newEndDate },
    isActive: { from: row.isActive, to: args.isActive ?? row.isActive },
    note: { from: currentNote, to: newNote },
  };
  if (!args.confirm) return preview("update_recurring_rule", plan);

  const amount = await encryptPacked(String(newAmount), session.dek);
  const note = newNote ? await encryptPacked(newNote, session.dek) : null;
  await db
    .update(schema.recurringRules)
    .set({
      name: args.name ?? row.name,
      categoryId: category !== undefined ? category?.id ?? null : row.categoryId,
      accountId: account !== undefined ? account?.id ?? null : row.accountId,
      amount,
      frequency: args.frequency ?? row.frequency,
      interval: args.interval ?? row.interval,
      startDate: newStartDate,
      endDate: newEndDate,
      isActive: args.isActive ?? row.isActive,
      note,
    })
    .where(and(eq(schema.recurringRules.id, args.id), eq(schema.recurringRules.userId, session.userId)));
  return { status: "done", ...plan };
}
