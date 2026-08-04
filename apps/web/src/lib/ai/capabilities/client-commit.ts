"use client";

/**
 * Browser-side commit path for Smart Entry drafts whose capability has
 * `requiresClientEncryption: true` (definitions.ts) — every create and
 * log-against capability except the plain deletes. Those capabilities'
 * `resolve()` (definitions.ts, runs server-side inside `/api/v1/ai/extract`)
 * only ever *validates and displays* a plaintext draft; nothing gets
 * written there. This file is where the actual write happens: it calls the
 * exact same `encryptedCreate*`/`encryptedRecord*`/`encryptedAddContribution`
 * client-action wrapper the module's own manual form already binds to
 * `useActionState` — same validate-then-encrypt-then-call-the-real-Server-
 * Action path, just fed from a draft's fields instead of a form submit.
 * See docs/ai-smart-entry-plan.md "Client-side commit for encrypted
 * capabilities."
 *
 * Contribution/payment capabilities (`investment.contribution`,
 * `loan.payment`, `goal.contribution`) need the target row's *current*
 * decrypted amounts to compute a new running total/split client-side (the
 * server can't do that arithmetic on ciphertext) — `SmartEntryView` passes
 * those in via `ClientCommitContext`, sourced from the same `useSideData()`
 * hook the Investments/Loans/Goals pages already use. Looking a `targetId`
 * up in that list *is* the ownership check for these two capabilities:
 * `useSideData()`'s underlying reads are RLS-scoped to the caller, so an id
 * that isn't in the list is either someone else's row or doesn't exist —
 * either way `.find()` returns `undefined` and this refuses, the same
 * outcome `commit.ts`'s server-side `targetBelongsToUser()` gives the
 * delete capabilities.
 */

import { encryptedCreateTransaction } from "@/lib/transactions/client-actions";
import {
  encryptedCreateInvestment,
  encryptedRecordContribution,
} from "@/lib/investments/client-actions";
import { encryptedCreateLoan, encryptedRecordPayment } from "@/lib/loans/client-actions";
import { encryptedCreateGoal, encryptedAddContribution } from "@/lib/goals/client-actions";
import { encryptedCreateBudget } from "@/lib/budgets/client-actions";
import { encryptedCreateRecurringRule } from "@/lib/recurring/client-actions";
import type { InvestmentWithProjection } from "@/lib/investments/types";
import type { LoanWithProjection } from "@/lib/loans/types";
import type { GoalWithProgress } from "@/lib/goals/types";

export interface ClientCommitResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface ClientCommitContext {
  dek: CryptoKey;
  /** Decrypted target pools for the three log-against capabilities — see
   * this file's top comment. Fine to pass an empty array if the caller
   * hasn't loaded them yet; a missing target just becomes a "couldn't be
   * found" error rather than a crash. */
  investments: InvestmentWithProjection[];
  loans: LoanWithProjection[];
  goals: GoalWithProgress[];
}

/** Mirrors `capabilities/shared.ts`'s `toFormData` — kept as a separate
 * copy because that file is `"server-only"` and this one must run in the
 * browser. Bridges a draft's validated, plain field object into the
 * `FormData` shape every `encryptedCreate*`/`encryptedRecord*` wrapper
 * expects (they're built to bind to `useActionState`, which is
 * FormData-shaped). */
function toFormData(fields: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    fd.set(key, typeof value === "boolean" ? String(value) : String(value));
  }
  return fd;
}

/** The capability keys this file knows how to commit — kept in sync with
 * `requiresClientEncryption: true` entries in definitions.ts. `commitOne`
 * below falls through to a clear error for anything else, rather than
 * silently no-op-ing. */
export async function commitClientCapability(
  capability: string,
  fields: Record<string, unknown>,
  targetId: string | undefined,
  ctx: ClientCommitContext,
): Promise<ClientCommitResult> {
  const fd = toFormData(fields);

  switch (capability) {
    case "transaction.expense":
    case "transaction.income":
      return encryptedCreateTransaction(ctx.dek, undefined, fd);

    case "investment.create":
      return encryptedCreateInvestment(ctx.dek, undefined, fd);

    case "investment.contribution": {
      const investment = ctx.investments.find((i) => i.id === targetId);
      if (!investment) return { ok: false, error: "That investment could not be found." };
      return encryptedRecordContribution(ctx.dek, investment, undefined, fd);
    }

    case "loan.create":
      return encryptedCreateLoan(ctx.dek, undefined, fd);

    case "loan.payment": {
      const loan = ctx.loans.find((l) => l.id === targetId);
      if (!loan) return { ok: false, error: "That loan could not be found." };
      return encryptedRecordPayment(ctx.dek, loan, undefined, fd);
    }

    case "goal.create":
      return encryptedCreateGoal(ctx.dek, undefined, fd);

    case "goal.contribution": {
      const goal = ctx.goals.find((g) => g.id === targetId);
      if (!goal) return { ok: false, error: "That goal could not be found." };
      return encryptedAddContribution(ctx.dek, goal, undefined, fd);
    }

    case "budget.create":
      return encryptedCreateBudget(ctx.dek, undefined, fd);

    case "recurring.create":
      return encryptedCreateRecurringRule(ctx.dek, undefined, fd);

    default:
      return { ok: false, error: `"${capability}" isn't available yet.` };
  }
}
