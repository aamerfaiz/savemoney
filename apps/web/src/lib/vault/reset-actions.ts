"use server";

/**
 * "Reset account" — the last-resort escape hatch for a user who's
 * forgotten their vault passphrase *and* lost their recovery code, the
 * one scenario this doc's "not even me" design explicitly can't recover
 * from (see docs/e2ee-path-b-plan.md — there is deliberately no
 * server-side/support-ticket decryption path). Deletes every row this
 * account owns in every table encrypted under the vault DEK — which,
 * once the DEK that wrapped it is unreachable, is permanently
 * undecryptable garbage anyway, not real data being thrown away — plus
 * the vault credentials and MCP tokens themselves, landing the account
 * back at "no vault set up yet" so the user gets a real fresh start
 * instead of a vault full of ciphertext nothing can ever open again.
 *
 * Deliberately does NOT touch: the `auth.users` row itself (this resets
 * data, not the login/account), or `accounts`/`categories`/
 * `import_batches` — none of those were ever vault-encrypted, so a lost
 * passphrase doesn't break them, and a brand-new signup already gets
 * categories re-seeded, so keeping the user's existing ones matches
 * "like new" better than deleting them.
 *
 * Scoped entirely by `userId` from the authenticated session — never
 * needs the DEK or an unlocked vault, since it doesn't decrypt anything,
 * only deletes rows. That's the point: this must work precisely when the
 * vault is unusable. Runs as one DB transaction so a failure partway
 * through can't leave a half-reset account (data gone but the vault row
 * still there, or vice versa).
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireUser } from "@/lib/supabase/require-user";
import type { ActionResult } from "./actions";

export async function resetAccount(): Promise<ActionResult> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { userId } = auth;

  try {
    await db.transaction(async (tx) => {
      // Children first — belt-and-suspenders alongside these three
      // tables' own ON DELETE CASCADE, not relying on it alone.
      await tx.delete(schema.goalContributions).where(eq(schema.goalContributions.userId, userId));
      await tx.delete(schema.loanPayments).where(eq(schema.loanPayments.userId, userId));
      await tx
        .delete(schema.investmentContributions)
        .where(eq(schema.investmentContributions.userId, userId));

      await tx.delete(schema.income).where(eq(schema.income.userId, userId));
      await tx.delete(schema.expenses).where(eq(schema.expenses.userId, userId));
      await tx.delete(schema.budgets).where(eq(schema.budgets.userId, userId));
      await tx.delete(schema.goals).where(eq(schema.goals.userId, userId));
      await tx.delete(schema.loans).where(eq(schema.loans.userId, userId));
      await tx.delete(schema.investments).where(eq(schema.investments.userId, userId));
      await tx.delete(schema.recurringRules).where(eq(schema.recurringRules.userId, userId));
      await tx.delete(schema.netWorthSnapshots).where(eq(schema.netWorthSnapshots.userId, userId));
      await tx.delete(schema.notifications).where(eq(schema.notifications.userId, userId));
      await tx.delete(schema.aiProviderKeys).where(eq(schema.aiProviderKeys.userId, userId));

      await tx.delete(schema.mcpAgentTokens).where(eq(schema.mcpAgentTokens.userId, userId));
      await tx.delete(schema.vaultKeys).where(eq(schema.vaultKeys.userId, userId));
    });
  } catch {
    return {
      ok: false,
      error: "Reset failed partway through — nothing was changed. Try again.",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
