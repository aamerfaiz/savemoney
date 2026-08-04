import { z } from "zod";

import type { CurrencyCode } from "@savemoney/finance-engine/format";

/** Mirrors apps/web/src/lib/transactions/types.ts exactly — same
 * validation, same wire shape, so a transaction created on either client
 * looks identical to the other. */
export type TransactionKind = "income" | "expense" | "transfer";

export interface Transaction {
  id: string;
  kind: TransactionKind;
  amount: number;
  currency: CurrencyCode;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  accountId: string | null;
  accountName: string | null;
  date: string;
  isRecurring: boolean;
  frequency: string;
  sourceType?: string | null;
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

const frequencies = ["one_time", "daily", "weekly", "monthly", "quarterly", "yearly"] as const;

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
    sourceType: z.enum(incomeSourceTypes).optional(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => !v.isRecurring || v.frequency !== "one_time", {
    message: "Choose how often a recurring transaction repeats",
    path: ["frequency"],
  });

export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const INCOME_SOURCE_TYPES = incomeSourceTypes;
export const FREQUENCIES = frequencies;
