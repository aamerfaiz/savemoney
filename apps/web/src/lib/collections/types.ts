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
  contributorName: z.string().trim().min(1, "Who contributed?").max(80),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  contributedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().trim().max(40).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

export type ContributorInput = z.infer<typeof contributorInputSchema>;

export const payoutInputSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  payoutAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(200).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  createExpense: z.coerce.boolean().default(true),
});

export type PayoutInput = z.infer<typeof payoutInputSchema>;

export interface CollectionContributor {
  id: string;
  contributorName: string;
  amount: number;
  contributedAt: string;
  method: string | null;
  note: string | null;
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
  payoutAmount: number | null;
  payoutAt: string | null;
  payoutNote: string | null;
  contributors: CollectionContributor[];
  summary: CollectionSummary;
}
