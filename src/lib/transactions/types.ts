import { z } from "zod";

import type { CurrencyCode } from "@/lib/format";

/** The kind of money movement. Income and expenses live in separate tables
 *  but the UI presents them as one unified "transaction" stream. */
export type TransactionKind = "income" | "expense";

/** A row as the UI consumes it — flattened from either table, with the
 *  category/account names already joined in. */
export interface Transaction {
  id: string;
  kind: TransactionKind;
  amount: number; // always positive; sign is derived from `kind`
  currency: CurrencyCode;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  accountId: string | null;
  accountName: string | null;
  date: string; // ISO date (received_at / spent_at)
  isRecurring: boolean;
  frequency: string;
  /** income only */
  sourceType?: string | null;
  /** expense only */
  note?: string | null;
  tags?: string[] | null;
}

export interface TransactionSummary {
  income: number;
  expenses: number;
  net: number;
  currency: CurrencyCode;
  count: number;
}

export type TransactionFilter = "all" | "income" | "expense";

const incomeSourceTypes = [
  "salary",
  "freelance",
  "rental",
  "interest",
  "business",
  "dividend",
  "other",
] as const;

const frequencies = [
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

/** Validation shared by the create/update Server Actions. */
export const transactionInputSchema = z
  .object({
    kind: z.enum(["income", "expense"]),
    amount: z.coerce
      .number()
      .positive("Amount must be greater than zero")
      .max(1_000_000_000, "That amount looks too large"),
    currency: z.string().length(3).default("USD"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
    categoryId: z.string().uuid().optional().nullable(),
    accountId: z.string().uuid().optional().nullable(),
    description: z.string().trim().max(200).optional().nullable(),
    isRecurring: z.coerce.boolean().default(false),
    frequency: z.enum(frequencies).default("one_time"),
    // income only
    sourceType: z.enum(incomeSourceTypes).optional(),
    // expense only
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => !v.isRecurring || v.frequency !== "one_time", {
    message: "Choose how often a recurring transaction repeats",
    path: ["frequency"],
  });

export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const INCOME_SOURCE_TYPES = incomeSourceTypes;
export const FREQUENCIES = frequencies;
