import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export interface RotationRawData {
  income: { id: string; amount: string; description: string | null }[];
  expenses: {
    id: string;
    amount: string;
    description: string | null;
    note: string | null;
    tags: string | null;
  }[];
  budgets: { id: string; amount: string }[];
  goals: {
    id: string;
    targetAmount: string;
    currentAmount: string;
    monthlyContribution: string | null;
  }[];
  goalContributions: { id: string; amount: string }[];
  loans: {
    id: string;
    principal: string;
    emi: string;
    remainingAmount: string;
    extraEmi: string | null;
  }[];
  loanPayments: {
    id: string;
    amount: string;
    principalComponent: string | null;
    interestComponent: string | null;
  }[];
  investments: {
    id: string;
    investedAmount: string;
    currentValue: string;
    monthlyContribution: string | null;
  }[];
  investmentContributions: { id: string; amount: string }[];
  netWorthSnapshots: {
    id: string;
    totalAssets: string;
    totalLiabilities: string;
    netWorth: string;
  }[];
  recurringRules: { id: string; amount: string }[];
  notifications: { id: string; body: string | null }[];
  aiProviderKeys: { id: string; encryptedKey: string; keyIv: string }[];
}

/**
 * Every ciphertext row, across every table encrypted under the vault DEK,
 * for the signed-in user only — the "Rotate vault" flow's read side
 * (Phase 3.5.6). Reads through the direct Postgres client (`db`) rather
 * than the Supabase/PostgREST client both because `aiProviderKeys` lives
 * in the `private` schema (invisible to PostgREST by design) and because
 * this needs every row across every table in one pass; explicit `userId`
 * filters on each query stand in for RLS here. Deliberately includes
 * soft-deleted rows (no `deletedAt` filter) — "re-encrypt every row" means
 * every row, so nothing is left stuck under the old DEK if it's ever read
 * again. Nothing is ever decrypted server-side — this only ever returns
 * ciphertext, for the client to decrypt with the DEK already unlocked in
 * memory and re-encrypt under a freshly generated one.
 */
export async function getRotationRawData(): Promise<RotationRawData | { error: string }> {
  if (!db) return { error: "Database isn't configured in this environment." };
  const userId = await currentUserId();
  if (!userId) return { error: "You need to sign in first." };

  const [
    income,
    expenses,
    budgets,
    goals,
    goalContributions,
    loans,
    loanPayments,
    investments,
    investmentContributions,
    netWorthSnapshots,
    recurringRules,
    notifications,
    aiProviderKeys,
  ] = await Promise.all([
    db
      .select({ id: schema.income.id, amount: schema.income.amount, description: schema.income.description })
      .from(schema.income)
      .where(eq(schema.income.userId, userId)),
    db
      .select({
        id: schema.expenses.id,
        amount: schema.expenses.amount,
        description: schema.expenses.description,
        note: schema.expenses.note,
        tags: schema.expenses.tags,
      })
      .from(schema.expenses)
      .where(eq(schema.expenses.userId, userId)),
    db
      .select({ id: schema.budgets.id, amount: schema.budgets.amount })
      .from(schema.budgets)
      .where(eq(schema.budgets.userId, userId)),
    db
      .select({
        id: schema.goals.id,
        targetAmount: schema.goals.targetAmount,
        currentAmount: schema.goals.currentAmount,
        monthlyContribution: schema.goals.monthlyContribution,
      })
      .from(schema.goals)
      .where(eq(schema.goals.userId, userId)),
    db
      .select({ id: schema.goalContributions.id, amount: schema.goalContributions.amount })
      .from(schema.goalContributions)
      .where(
        eq(schema.goalContributions.userId, userId),
      ),
    db
      .select({
        id: schema.loans.id,
        principal: schema.loans.principal,
        emi: schema.loans.emi,
        remainingAmount: schema.loans.remainingAmount,
        extraEmi: schema.loans.extraEmi,
      })
      .from(schema.loans)
      .where(eq(schema.loans.userId, userId)),
    db
      .select({
        id: schema.loanPayments.id,
        amount: schema.loanPayments.amount,
        principalComponent: schema.loanPayments.principalComponent,
        interestComponent: schema.loanPayments.interestComponent,
      })
      .from(schema.loanPayments)
      .where(eq(schema.loanPayments.userId, userId)),
    db
      .select({
        id: schema.investments.id,
        investedAmount: schema.investments.investedAmount,
        currentValue: schema.investments.currentValue,
        monthlyContribution: schema.investments.monthlyContribution,
      })
      .from(schema.investments)
      .where(eq(schema.investments.userId, userId)),
    db
      .select({
        id: schema.investmentContributions.id,
        amount: schema.investmentContributions.amount,
      })
      .from(schema.investmentContributions)
      .where(eq(schema.investmentContributions.userId, userId)),
    db
      .select({
        id: schema.netWorthSnapshots.id,
        totalAssets: schema.netWorthSnapshots.totalAssets,
        totalLiabilities: schema.netWorthSnapshots.totalLiabilities,
        netWorth: schema.netWorthSnapshots.netWorth,
      })
      .from(schema.netWorthSnapshots)
      .where(
        eq(schema.netWorthSnapshots.userId, userId),
      ),
    db
      .select({ id: schema.recurringRules.id, amount: schema.recurringRules.amount })
      .from(schema.recurringRules)
      .where(eq(schema.recurringRules.userId, userId)),
    db
      .select({ id: schema.notifications.id, body: schema.notifications.body })
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId)),
    db
      .select({
        id: schema.aiProviderKeys.id,
        encryptedKey: schema.aiProviderKeys.encryptedKey,
        keyIv: schema.aiProviderKeys.keyIv,
      })
      .from(schema.aiProviderKeys)
      .where(eq(schema.aiProviderKeys.userId, userId)),
  ]);

  return {
    income,
    expenses,
    budgets,
    goals,
    goalContributions,
    loans,
    loanPayments,
    investments,
    investmentContributions,
    netWorthSnapshots,
    recurringRules,
    notifications,
    aiProviderKeys,
  };
}
