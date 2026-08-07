import { z } from "zod";

import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { CollectionSummary } from "@savemoney/finance-engine/collections";

export const COLLECTION_STATUSES = ["open", "closed"] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

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

export interface CollectionContributor {
  id: string;
  displayName: string;
  linkedUserId: string | null;
  totalContributed: number;
  /** True for a contributor synthesized from pre-roster contributions that
   * share a name, rather than a real `collection_contributors` row —
   * `id` is a stable `legacy:<name>` key in this case, not a UUID. Surfaced
   * so the UI can offer a one-click "Link to roster" instead of treating
   * it as a second, separate kind of thing from real contributors. */
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

export interface CollectionExpenseRow {
  id: string;
  amount: number;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  paidByContributorId: string | null;
  paidByName: string | null;
  spentAt: string;
  linkedTransactionId: string | null;
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
  contributors: CollectionContributor[];
  contributions: CollectionContributionRow[];
  expenses: CollectionExpenseRow[];
  summary: CollectionSummary;
}
