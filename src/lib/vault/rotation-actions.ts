"use server";

/**
 * "Rotate vault" Server Action (Phase 3.5.6) — the write side of full
 * vault rotation: every row this account owns, across every table
 * encrypted under the vault DEK, gets its ciphertext replaced (already
 * re-encrypted client-side under a freshly generated DEK), and the DEK's
 * password/recovery wraps are replaced too. Runs as one DB transaction —
 * either everything lands, or nothing does; a partial rotation would be
 * worse than no rotation (some rows readable under the old DEK, some
 * under the new one, with no record of which). Every non-`id` value here
 * is already ciphertext or metadata, computed client-side — same
 * boundary `actions.ts` keeps for ordinary vault setup.
 *
 * Existing MCP agent tokens are revoked (not re-wrapped) as part of this:
 * their wrap wasn't derived from anything this server can re-run (the
 * HKDF input is the raw token, held only by the agent), so — same as a
 * lost device's quick-unlock PIN — there's no way to carry them forward.
 * The user re-mints tokens for agents they still trust via Settings →
 * Agent Access afterward.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { kdfParamsSchema, wrappedPayloadSchema, type ActionResult } from "./actions";
import { getRotationRawData } from "./rotation-queries";

/** Client-callable wrapper — see getRotationRawData's own doc comment. */
export async function fetchRotationRawData() {
  return getRotationRawData();
}

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

const rotationInputSchema = z.object({
  passwordWrap: wrappedPayloadSchema,
  passwordSalt: z.string().min(1),
  passwordKdfParams: kdfParamsSchema,
  recoveryWrap: wrappedPayloadSchema,
  recoverySalt: z.string().min(1),
  income: z.array(z.object({ ...idRow, amount: required, description: nullable })),
  expenses: z.array(
    z.object({
      ...idRow,
      amount: required,
      description: nullable,
      note: nullable,
      tags: nullable,
    }),
  ),
  budgets: z.array(z.object({ ...idRow, amount: required })),
  goals: z.array(
    z.object({
      ...idRow,
      targetAmount: required,
      currentAmount: required,
      monthlyContribution: nullable,
    }),
  ),
  goalContributions: z.array(z.object({ ...idRow, amount: required })),
  loans: z.array(
    z.object({
      ...idRow,
      principal: required,
      emi: required,
      remainingAmount: required,
      extraEmi: nullable,
    }),
  ),
  loanPayments: z.array(
    z.object({
      ...idRow,
      amount: required,
      principalComponent: nullable,
      interestComponent: nullable,
    }),
  ),
  investments: z.array(
    z.object({
      ...idRow,
      investedAmount: required,
      currentValue: required,
      monthlyContribution: nullable,
    }),
  ),
  investmentContributions: z.array(z.object({ ...idRow, amount: required })),
  netWorthSnapshots: z.array(
    z.object({ ...idRow, totalAssets: required, totalLiabilities: required, netWorth: required }),
  ),
  recurringRules: z.array(z.object({ ...idRow, amount: required })),
  notifications: z.array(z.object({ ...idRow, body: nullable })),
  aiProviderKeys: z.array(z.object({ ...idRow, encryptedKey: required, keyIv: required })),
});
export type RotationInput = z.infer<typeof rotationInputSchema>;

export async function applyVaultRotation(input: RotationInput): Promise<ActionResult> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };

  const parsed = rotationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { userId } = auth;
  const d = parsed.data;

  try {
    await db.transaction(async (tx) => {
      for (const r of d.income) {
        await tx
          .update(schema.income)
          .set({ amount: r.amount, description: r.description })
          .where(and(eq(schema.income.id, r.id), eq(schema.income.userId, userId)));
      }
      for (const r of d.expenses) {
        await tx
          .update(schema.expenses)
          .set({ amount: r.amount, description: r.description, note: r.note, tags: r.tags })
          .where(and(eq(schema.expenses.id, r.id), eq(schema.expenses.userId, userId)));
      }
      for (const r of d.budgets) {
        await tx.update(schema.budgets).set({ amount: r.amount }).where(and(eq(schema.budgets.id, r.id), eq(schema.budgets.userId, userId)));
      }
      for (const r of d.goals) {
        await tx
          .update(schema.goals)
          .set({
            targetAmount: r.targetAmount,
            currentAmount: r.currentAmount,
            monthlyContribution: r.monthlyContribution,
          })
          .where(and(eq(schema.goals.id, r.id), eq(schema.goals.userId, userId)));
      }
      for (const r of d.goalContributions) {
        await tx
          .update(schema.goalContributions)
          .set({ amount: r.amount })
          .where(and(eq(schema.goalContributions.id, r.id), eq(schema.goalContributions.userId, userId)));
      }
      for (const r of d.loans) {
        await tx
          .update(schema.loans)
          .set({
            principal: r.principal,
            emi: r.emi,
            remainingAmount: r.remainingAmount,
            extraEmi: r.extraEmi,
          })
          .where(and(eq(schema.loans.id, r.id), eq(schema.loans.userId, userId)));
      }
      for (const r of d.loanPayments) {
        await tx
          .update(schema.loanPayments)
          .set({
            amount: r.amount,
            principalComponent: r.principalComponent,
            interestComponent: r.interestComponent,
          })
          .where(and(eq(schema.loanPayments.id, r.id), eq(schema.loanPayments.userId, userId)));
      }
      for (const r of d.investments) {
        await tx
          .update(schema.investments)
          .set({
            investedAmount: r.investedAmount,
            currentValue: r.currentValue,
            monthlyContribution: r.monthlyContribution,
          })
          .where(and(eq(schema.investments.id, r.id), eq(schema.investments.userId, userId)));
      }
      for (const r of d.investmentContributions) {
        await tx
          .update(schema.investmentContributions)
          .set({ amount: r.amount })
          .where(and(eq(schema.investmentContributions.id, r.id), eq(schema.investmentContributions.userId, userId)));
      }
      for (const r of d.netWorthSnapshots) {
        await tx
          .update(schema.netWorthSnapshots)
          .set({
            totalAssets: r.totalAssets,
            totalLiabilities: r.totalLiabilities,
            netWorth: r.netWorth,
          })
          .where(and(eq(schema.netWorthSnapshots.id, r.id), eq(schema.netWorthSnapshots.userId, userId)));
      }
      for (const r of d.recurringRules) {
        await tx
          .update(schema.recurringRules)
          .set({ amount: r.amount })
          .where(and(eq(schema.recurringRules.id, r.id), eq(schema.recurringRules.userId, userId)));
      }
      for (const r of d.notifications) {
        await tx
          .update(schema.notifications)
          .set({ body: r.body })
          .where(and(eq(schema.notifications.id, r.id), eq(schema.notifications.userId, userId)));
      }
      for (const r of d.aiProviderKeys) {
        await tx
          .update(schema.aiProviderKeys)
          .set({ encryptedKey: r.encryptedKey, keyIv: r.keyIv })
          .where(and(eq(schema.aiProviderKeys.id, r.id), eq(schema.aiProviderKeys.userId, userId)));
      }

      await tx
        .update(schema.vaultKeys)
        .set({
          wrappedDekByPassword: d.passwordWrap.ciphertext,
          passwordDekIv: d.passwordWrap.iv,
          passwordKekSalt: d.passwordSalt,
          passwordKdfParams: d.passwordKdfParams,
          wrappedDekByRecovery: d.recoveryWrap.ciphertext,
          recoveryDekIv: d.recoveryWrap.iv,
          recoveryKekSalt: d.recoverySalt,
          recoveryAcknowledgedAt: new Date(),
        })
        .where(eq(schema.vaultKeys.userId, userId));

      await tx
        .update(schema.mcpAgentTokens)
        .set({ revokedAt: new Date() })
        .where(eq(schema.mcpAgentTokens.userId, userId));
    });
  } catch {
    return {
      ok: false,
      error: "Rotation failed partway through — nothing was changed. Try again.",
    };
  }

  revalidatePath("/settings");
  return { ok: true };
}
