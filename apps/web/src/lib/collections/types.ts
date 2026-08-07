import { z } from "zod";

import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type {
  CollectionSummary,
  ContributorBalance,
  SuggestedSettlement,
} from "@savemoney/finance-engine/collections";

export const COLLECTION_STATUSES = ["open", "closed"] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

/** Chosen once at creation (collection-form.tsx hides the selector on
 * edit) — see the schema comment on `collections.type` for what each means. */
export const COLLECTION_TYPES = ["pool", "trip"] as const;
export type CollectionType = (typeof COLLECTION_TYPES)[number];

/** Icon choices offered when creating a collection. */
export const COLLECTION_ICONS = [
  "gift",
  "users",
  "party-popper",
  "hand-coins",
  "piggy-bank",
] as const;

export const collectionInputSchema = z.object({
  title: z.string().trim().min(1, "Give this collection a name").max(80),
  purpose: z.string().trim().max(200).optional().nullable(),
  icon: z.string().max(40).optional().nullable(),
  targetAmount: z.coerce
    .number()
    .positive("Target must be greater than zero")
    .max(1_000_000_000)
    .optional()
    .nullable(),
  currency: z.string().length(3).default("USD"),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  status: z.enum(COLLECTION_STATUSES).default("open"),
  // Only meaningful on create — updateCollection (actions.ts) never writes
  // this field, so a stale/edited value posted from an edit form is
  // silently ignored rather than changing an existing collection's type.
  type: z.enum(COLLECTION_TYPES).default("pool"),
});

export type CollectionInput = z.infer<typeof collectionInputSchema>;

export const contributorInputSchema = z.object({
  displayName: z.string().trim().min(1, "Give this contributor a name").max(80),
});

export type ContributorInput = z.infer<typeof contributorInputSchema>;

export const contributionInputSchema = z.object({
  contributorId: z.string().uuid(),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  contributedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

export type ContributionInput = z.infer<typeof contributionInputSchema>;

/** Every field optional — used to edit an existing contribution's amount,
 * date, or method after the fact rather than only ever delete-and-redo. */
export const contributionEditInputSchema = contributionInputSchema
  .omit({ contributorId: true })
  .partial();

export type ContributionEditInput = z.infer<typeof contributionEditInputSchema>;

export const expenseInputSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  description: z.string().trim().max(200).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  paidByContributorId: z.string().uuid().optional().nullable(),
  spentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linkToTransaction: z.coerce.boolean().default(false),
  accountId: z.string().uuid().optional().nullable(),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

/* ----------------------------------------------------------------------- */
/* Trip-type only: multi-payer expenses, splits, settlements               */
/* ----------------------------------------------------------------------- */

const tripPartyInputSchema = z.object({
  contributorId: z.string().uuid(),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
});

/** A `trip`-type expense: unlike `expenseInputSchema`, no single optional
 * `paidByContributorId` — `payers` can be more than one person, and
 * `splits` says who it's divided between and by how much. Both arrays must
 * each sum to `amount`; the form enforces that before submit, the server
 * action re-checks it (see `addTripExpense`, actions.ts). */
export const tripExpenseInputSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  description: z.string().trim().max(200).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  spentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payers: z.array(tripPartyInputSchema).min(1, "Add at least one payer"),
  splits: z.array(tripPartyInputSchema).min(1, "Split with at least one person"),
  linkToTransaction: z.coerce.boolean().default(false),
  accountId: z.string().uuid().optional().nullable(),
});

export type TripExpenseInput = z.infer<typeof tripExpenseInputSchema>;

export const settlementInputSchema = z
  .object({
    fromContributorId: z.string().uuid(),
    toContributorId: z.string().uuid(),
    amount: z.coerce.number().positive("Amount must be greater than zero"),
    settledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().trim().max(200).optional().nullable(),
  })
  .refine((v) => v.fromContributorId !== v.toContributorId, {
    message: "Pick two different people",
    path: ["toContributorId"],
  });

export type SettlementInput = z.infer<typeof settlementInputSchema>;

export interface CollectionContributor {
  id: string;
  displayName: string;
  linkedUserId: string | null;
  totalContributed: number;
  /** True for a contributor synthesized from pre-roster contributions that
   * share a name, rather than a real `collection_contributors` row —
   * `id` is a stable `legacy:<name>` key in this case, not a UUID. Surfaced
   * so the UI can offer a one-click "Link to roster" instead of treating
   * it as a second, separate kind of thing from real contributors. Never
   * happens for a `trip`-type collection — legacy entries only come from
   * pre-roster `collection_contributions` rows, which trip collections
   * never create. */
  isLegacy: boolean;
}

export interface CollectionContributionRow {
  id: string;
  contributorId: string;
  contributorName: string;
  amount: number;
  contributedAt: string;
  method: string | null;
  note: string | null;
}

export interface ExpenseParty {
  contributorId: string;
  contributorName: string;
  amount: number;
}

export interface CollectionExpenseRow {
  id: string;
  amount: number;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  /** `pool`-type only — the old single optional "who fronted it". */
  paidByContributorId: string | null;
  paidByName: string | null;
  /** `trip`-type only — always `[]` for a `pool`-type expense. */
  payers: ExpenseParty[];
  /** `trip`-type only — always `[]` for a `pool`-type expense. */
  splits: ExpenseParty[];
  spentAt: string;
  linkedTransactionId: string | null;
}

/** `trip`-type only — a recorded payment between two contributors, outside
 * of any expense. See `collections.trip` schema comment. */
export interface CollectionSettlementRow {
  id: string;
  fromContributorId: string;
  fromName: string;
  toContributorId: string;
  toName: string;
  amount: number;
  settledAt: string;
  note: string | null;
}

export type ContributorBalanceRow = ContributorBalance;
export interface SuggestedSettlementRow extends SuggestedSettlement {
  fromName: string;
  toName: string;
}

export interface CollectionWithProgress {
  id: string;
  title: string;
  purpose: string | null;
  icon: string | null;
  targetAmount: number | null;
  currency: CurrencyCode;
  eventDate: string | null;
  status: CollectionStatus;
  type: CollectionType;
  contributors: CollectionContributor[];
  contributions: CollectionContributionRow[];
  expenses: CollectionExpenseRow[];
  summary: CollectionSummary;
  /** `trip`-type only — `[]` for `pool`-type collections. */
  settlements: CollectionSettlementRow[];
  /** `trip`-type only — per-contributor net position, `[]` for `pool`. */
  balances: ContributorBalanceRow[];
  /** `trip`-type only — minimal settle-up plan derived from `balances`. */
  suggestedSettlements: SuggestedSettlementRow[];
}
