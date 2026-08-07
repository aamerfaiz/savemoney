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

export const participantInputSchema = z.object({
  displayName: z.string().trim().min(1, "Give this participant a name").max(80),
});

export type ParticipantInput = z.infer<typeof participantInputSchema>;

export const contributionInputSchema = z.object({
  participantId: z.string().uuid(),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  contributedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

export type ContributionInput = z.infer<typeof contributionInputSchema>;

export const expenseInputSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  description: z.string().trim().max(200).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  paidByParticipantId: z.string().uuid().optional().nullable(),
  spentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linkToTransaction: z.coerce.boolean().default(false),
  accountId: z.string().uuid().optional().nullable(),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export interface CollectionParticipant {
  id: string;
  displayName: string;
  linkedUserId: string | null;
  totalContributed: number;
}

export interface CollectionContributionRow {
  id: string;
  participantId: string | null;
  /** The participant's display name, or the legacy `contributor_name` for a
   * pre-roster row that hasn't been added to the roster yet. */
  contributorName: string;
  amount: number;
  contributedAt: string;
  method: string | null;
  note: string | null;
  /** True for a pre-participants-table row — `participantId` is null and
   * `contributorName` came from the legacy fallback field. Surfaced so the
   * UI can offer a one-click "add to roster" instead of silently migrating
   * data in the background. */
  isLegacy: boolean;
}

export interface CollectionExpenseRow {
  id: string;
  amount: number;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  paidByParticipantId: string | null;
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
  participants: CollectionParticipant[];
  contributions: CollectionContributionRow[];
  expenses: CollectionExpenseRow[];
  summary: CollectionSummary;
}
