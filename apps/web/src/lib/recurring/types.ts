import { z } from "zod";

import type { CurrencyCode } from "@/lib/format";
import type { RecurringFrequency } from "@savemoney/finance-engine/recurring";

export type RecurringKind = "income" | "expense";

export interface RecurringRuleWithSchedule {
  id: string;
  name: string;
  kind: RecurringKind;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  accountId: string | null;
  amount: number;
  currency: CurrencyCode;
  frequency: RecurringFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  note: string | null;
  /** Next occurrence on/after today, or null when ended/paused. */
  nextDate: string | null;
  /** Amount normalized to a monthly figure (drives the totals). */
  monthlyAmount: number;
}

export const RECURRING_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

export const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

/** Compact "every N × unit" label, e.g. "Every 2 weeks" / "Monthly". */
export function cadenceLabel(
  frequency: RecurringFrequency,
  interval: number,
): string {
  if (interval <= 1) return FREQUENCY_LABEL[frequency];
  const unit: Record<RecurringFrequency, string> = {
    daily: "days",
    weekly: "weeks",
    monthly: "months",
    quarterly: "quarters",
    yearly: "years",
  };
  return `Every ${interval} ${unit[frequency]}`;
}

export const recurringInputSchema = z
  .object({
    name: z.string().trim().min(1, "Give the rule a name").max(80),
    kind: z.enum(["income", "expense"]).default("expense"),
    categoryId: z.string().uuid().optional().nullable(),
    accountId: z.string().uuid().optional().nullable(),
    amount: z.coerce.number().positive("Amount must be greater than zero"),
    currency: z.string().length(3).default("USD"),
    frequency: z.enum(RECURRING_FREQUENCIES).default("monthly"),
    interval: z.coerce.number().int().min(1, "Interval must be at least 1").max(365).default(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    isActive: z.coerce.boolean().default(true),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine(
    (v) => !v.endDate || v.endDate >= v.startDate,
    { message: "End date can't be before the start date", path: ["endDate"] },
  );

export type RecurringInput = z.infer<typeof recurringInputSchema>;
