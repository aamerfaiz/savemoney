"use server";

/**
 * Phase 3.5.7 "Backfill" — the write side. Each finance module's client
 * decrypt pass (`finance/decrypt.ts`) recovers legacy plaintext rows (rows
 * written before that table's encryption landed — see
 * docs/e2ee-path-b-plan.md's "pre-migration plaintext rows don't get to
 * opt out either; backfill re-encrypts their existing data the first time
 * they touch the now-migrated module") and, for any it recovers, calls the
 * matching action here with the freshly re-encrypted values. Every
 * argument is already packed ciphertext, computed client-side — same
 * ciphertext-in boundary every other vault write keeps. One action per
 * table (not a single rotation-style bulk call) since backfill fires
 * per-module, opportunistically, as the user happens to visit each page —
 * there's no single moment where "every table" is in hand at once, unlike
 * a deliberate "Rotate vault" action.
 *
 * `loan_payments` and `notifications.body` have no read/decrypt path
 * anywhere in the app (write-once audit trails, never displayed — see
 * their own 3.5.4 write-ups), so there's no "first time they touch the
 * module" moment to hook backfill into for those two. Any pre-migration
 * plaintext left in them stays until the user runs a "Rotate vault" (which
 * re-encrypts every row, including these) — a known, documented gap, not
 * an oversight.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." } as const;
  return { userId: user.id } as const;
}

const idRow = { id: z.string().uuid() };
const required = z.string().min(1);
const nullable = z.string().min(1).nullable();

async function requireDb(): Promise<ActionResult | null> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };
  return null;
}

const incomeSchema = z.array(z.object({ ...idRow, amount: required, description: nullable }));
export async function backfillIncomeRows(rows: z.infer<typeof incomeSchema>): Promise<ActionResult> {
  const dbError = await requireDb();
  if (dbError) return dbError;
  const parsed = incomeSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  for (const r of parsed.data) {
    await db!
      .update(schema.income)
      .set({ amount: r.amount, description: r.description })
      .where(and(eq(schema.income.id, r.id), eq(schema.income.userId, auth.userId)));
  }
  return { ok: true };
}

const expenseSchema = z.array(
  z.object({ ...idRow, amount: required, description: nullable, note: nullable, tags: nullable }),
);
export async function backfillExpenseRows(rows: z.infer<typeof expenseSchema>): Promise<ActionResult> {
  const dbError = await requireDb();
  if (dbError) return dbError;
  const parsed = expenseSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  for (const r of parsed.data) {
    await db!
      .update(schema.expenses)
      .set({ amount: r.amount, description: r.description, note: r.note, tags: r.tags })
      .where(and(eq(schema.expenses.id, r.id), eq(schema.expenses.userId, auth.userId)));
  }
  return { ok: true };
}

const budgetSchema = z.array(z.object({ ...idRow, amount: required }));
export async function backfillBudgetRows(rows: z.infer<typeof budgetSchema>): Promise<ActionResult> {
  const dbError = await requireDb();
  if (dbError) return dbError;
  const parsed = budgetSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  for (const r of parsed.data) {
    await db!
      .update(schema.budgets)
      .set({ amount: r.amount })
      .where(and(eq(schema.budgets.id, r.id), eq(schema.budgets.userId, auth.userId)));
  }
  return { ok: true };
}

const goalSchema = z.array(
  z.object({ ...idRow, targetAmount: required, currentAmount: required, monthlyContribution: nullable }),
);
export async function backfillGoalRows(rows: z.infer<typeof goalSchema>): Promise<ActionResult> {
  const dbError = await requireDb();
  if (dbError) return dbError;
  const parsed = goalSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  for (const r of parsed.data) {
    await db!
      .update(schema.goals)
      .set({
        targetAmount: r.targetAmount,
        currentAmount: r.currentAmount,
        monthlyContribution: r.monthlyContribution,
      })
      .where(and(eq(schema.goals.id, r.id), eq(schema.goals.userId, auth.userId)));
  }
  return { ok: true };
}

const goalContributionSchema = z.array(z.object({ ...idRow, amount: required }));
export async function backfillGoalContributionRows(
  rows: z.infer<typeof goalContributionSchema>,
): Promise<ActionResult> {
  const dbError = await requireDb();
  if (dbError) return dbError;
  const parsed = goalContributionSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  for (const r of parsed.data) {
    await db!
      .update(schema.goalContributions)
      .set({ amount: r.amount })
      .where(and(eq(schema.goalContributions.id, r.id), eq(schema.goalContributions.userId, auth.userId)));
  }
  return { ok: true };
}

const loanSchema = z.array(
  z.object({ ...idRow, principal: required, emi: required, remainingAmount: required, extraEmi: nullable }),
);
export async function backfillLoanRows(rows: z.infer<typeof loanSchema>): Promise<ActionResult> {
  const dbError = await requireDb();
  if (dbError) return dbError;
  const parsed = loanSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  for (const r of parsed.data) {
    await db!
      .update(schema.loans)
      .set({
        principal: r.principal,
        emi: r.emi,
        remainingAmount: r.remainingAmount,
        extraEmi: r.extraEmi,
      })
      .where(and(eq(schema.loans.id, r.id), eq(schema.loans.userId, auth.userId)));
  }
  return { ok: true };
}

const investmentSchema = z.array(
  z.object({ ...idRow, investedAmount: required, currentValue: required, monthlyContribution: nullable }),
);
export async function backfillInvestmentRows(rows: z.infer<typeof investmentSchema>): Promise<ActionResult> {
  const dbError = await requireDb();
  if (dbError) return dbError;
  const parsed = investmentSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  for (const r of parsed.data) {
    await db!
      .update(schema.investments)
      .set({
        investedAmount: r.investedAmount,
        currentValue: r.currentValue,
        monthlyContribution: r.monthlyContribution,
      })
      .where(and(eq(schema.investments.id, r.id), eq(schema.investments.userId, auth.userId)));
  }
  return { ok: true };
}

const investmentContributionSchema = z.array(z.object({ ...idRow, amount: required }));
export async function backfillInvestmentContributionRows(
  rows: z.infer<typeof investmentContributionSchema>,
): Promise<ActionResult> {
  const dbError = await requireDb();
  if (dbError) return dbError;
  const parsed = investmentContributionSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  for (const r of parsed.data) {
    await db!
      .update(schema.investmentContributions)
      .set({ amount: r.amount })
      .where(
        and(
          eq(schema.investmentContributions.id, r.id),
          eq(schema.investmentContributions.userId, auth.userId),
        ),
      );
  }
  return { ok: true };
}

const snapshotSchema = z.array(
  z.object({ ...idRow, totalAssets: required, totalLiabilities: required, netWorth: required }),
);
export async function backfillSnapshotRows(rows: z.infer<typeof snapshotSchema>): Promise<ActionResult> {
  const dbError = await requireDb();
  if (dbError) return dbError;
  const parsed = snapshotSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  for (const r of parsed.data) {
    await db!
      .update(schema.netWorthSnapshots)
      .set({ totalAssets: r.totalAssets, totalLiabilities: r.totalLiabilities, netWorth: r.netWorth })
      .where(and(eq(schema.netWorthSnapshots.id, r.id), eq(schema.netWorthSnapshots.userId, auth.userId)));
  }
  return { ok: true };
}

const recurringRuleSchema = z.array(z.object({ ...idRow, amount: required }));
export async function backfillRecurringRuleRows(
  rows: z.infer<typeof recurringRuleSchema>,
): Promise<ActionResult> {
  const dbError = await requireDb();
  if (dbError) return dbError;
  const parsed = recurringRuleSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  for (const r of parsed.data) {
    await db!
      .update(schema.recurringRules)
      .set({ amount: r.amount })
      .where(and(eq(schema.recurringRules.id, r.id), eq(schema.recurringRules.userId, auth.userId)));
  }
  return { ok: true };
}
