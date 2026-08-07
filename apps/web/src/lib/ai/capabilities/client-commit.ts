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
import {
  encryptedCreateCollection,
  encryptedCreateParticipant,
  encryptedEditCollectionFields,
  encryptedAddContribution as encryptedAddCollectionContribution,
  encryptedAddExpense,
} from "@/lib/collections/client-actions";
import type { InvestmentWithProjection } from "@/lib/investments/types";
import type { LoanWithProjection } from "@/lib/loans/types";
import type { GoalWithProgress } from "@/lib/goals/types";
import { COLLECTION_STATUSES, type CollectionWithProgress } from "@/lib/collections/types";

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
  collections: CollectionWithProgress[];
}

/** Mirrors `extract-utils.ts`'s coercions — kept as a separate copy because
 * that file is `"server-only"` and this one must run in the browser, same
 * reasoning as this file's own `toFormData` above. */
function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.-]/g, "");
    if (cleaned === "" || cleaned === "-") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function normalizeDate(v: unknown): string | null {
  const s = asString(v);
  return s && DATE_RE.test(s) ? s : null;
}
function normalizeEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  const s = asString(v)?.toLowerCase();
  if (!s) return null;
  return allowed.find((a) => a.toLowerCase() === s) ?? null;
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ContributorDraft {
  contributorName?: unknown;
  amount?: unknown;
  contributedAt?: unknown;
  method?: unknown;
}

/** Finds an existing participant by case-insensitive name match, or creates
 * one — participant names are encrypted, so this match can only ever
 * happen here (client-side, against the already-decrypted roster), never
 * in definitions.ts's server-side `resolve()`. */
async function resolveOrCreateParticipant(
  dek: CryptoKey,
  collectionId: string,
  name: string,
  existingParticipants: { id: string; displayName: string }[],
): Promise<{ id: string } | { error: string }> {
  const norm = name.trim().toLowerCase();
  const match = existingParticipants.find((p) => p.displayName.trim().toLowerCase() === norm);
  if (match) return { id: match.id };

  const result = await encryptedCreateParticipant(dek, collectionId, undefined, toFormData({ displayName: name }));
  if (!result.ok || !result.id) return { error: result.error ?? "Couldn't add participant." };
  return { id: result.id };
}

/** Adds one contribution from a `collection.create`/`collection.edit`/
 * `collection.contribution` draft — same shape `parseContributorsArg`
 * (definitions.ts) already validated server-side, re-coerced here since
 * this file can't import that "server-only" module. Resolves (or creates)
 * the named participant first, then logs the contribution against them. */
async function addOneContribution(
  dek: CryptoKey,
  collectionId: string,
  existingParticipants: { id: string; displayName: string }[],
  draft: ContributorDraft,
): Promise<ClientCommitResult> {
  const name = asString(draft.contributorName);
  const amount = toNumber(draft.amount);
  if (!name || amount == null) return { ok: false, error: "Missing contributor name or amount." };

  const participant = await resolveOrCreateParticipant(dek, collectionId, name, existingParticipants);
  if ("error" in participant) return { ok: false, error: participant.error };

  const fd = toFormData({
    participantId: participant.id,
    amount,
    contributedAt: normalizeDate(draft.contributedAt) ?? todayISO(),
    method: asString(draft.method),
  });
  return encryptedAddCollectionContribution(dek, collectionId, undefined, fd);
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

    case "collection.create": {
      const { contributors, ...scalarFields } = fields as {
        contributors?: ContributorDraft[];
      } & Record<string, unknown>;
      const result = await encryptedCreateCollection(ctx.dek, undefined, toFormData(scalarFields));
      if (!result.ok || !result.id) return result;
      if (Array.isArray(contributors)) {
        for (const c of contributors) {
          const r = await addOneContribution(ctx.dek, result.id, [], c);
          if (!r.ok) return r;
        }
      }
      return { ok: true };
    }

    case "collection.contribution": {
      const collection = ctx.collections.find((c) => c.id === targetId);
      if (!collection) return { ok: false, error: "That collection could not be found." };
      return addOneContribution(ctx.dek, collection.id, collection.participants, fields as ContributorDraft);
    }

    case "collection.edit": {
      const collection = ctx.collections.find((c) => c.id === targetId);
      if (!collection) return { ok: false, error: "That collection could not be found." };
      const { contributors, ...scalarFields } = fields as {
        contributors?: ContributorDraft[];
      } & Record<string, unknown>;

      const editResult = await encryptedEditCollectionFields(ctx.dek, collection, {
        title: asString(scalarFields.title) ?? undefined,
        purpose: "purpose" in scalarFields ? asString(scalarFields.purpose) : undefined,
        icon: "icon" in scalarFields ? asString(scalarFields.icon) : undefined,
        targetAmount: "targetAmount" in scalarFields ? toNumber(scalarFields.targetAmount) : undefined,
        eventDate: "eventDate" in scalarFields ? normalizeDate(scalarFields.eventDate) : undefined,
        status: normalizeEnum(scalarFields.status, COLLECTION_STATUSES) ?? undefined,
      });
      if (!editResult.ok) return editResult;

      if (Array.isArray(contributors)) {
        for (const c of contributors) {
          const r = await addOneContribution(ctx.dek, collection.id, collection.participants, c);
          if (!r.ok) return r;
        }
      }
      return { ok: true };
    }

    case "collection.expense": {
      const collection = ctx.collections.find((c) => c.id === targetId);
      if (!collection) return { ok: false, error: "That collection could not be found." };
      return encryptedAddExpense(ctx.dek, collection.id, undefined, fd);
    }

    default:
      return { ok: false, error: `"${capability}" isn't available yet.` };
  }
}
