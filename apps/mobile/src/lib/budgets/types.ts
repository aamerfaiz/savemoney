import { z } from "zod";

import type { CurrencyCode } from "@savemoney/finance-engine/format";

/** Direct port of apps/web/src/lib/budgets/types.ts. */
export type BudgetPeriod = "weekly" | "monthly" | "yearly";
export type BudgetStatus = "ok" | "warning" | "over";

export interface BudgetWithProgress {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  period: BudgetPeriod;
  amount: number;
  currency: CurrencyCode;
  spent: number;
  remaining: number;
  utilization: number;
  status: BudgetStatus;
}

export const BUDGET_PERIODS = ["weekly", "monthly", "yearly"] as const;

export const budgetInputSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  period: z.enum(BUDGET_PERIODS).default("monthly"),
  amount: z.coerce
    .number()
    .positive("Amount must be greater than zero")
    .max(1_000_000_000, "That amount looks too large"),
  currency: z.string().length(3).default("USD"),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
});

export type BudgetInput = z.infer<typeof budgetInputSchema>;

export function budgetStatus(utilization: number): BudgetStatus {
  if (utilization > 1) return "over";
  if (utilization >= 0.8) return "warning";
  return "ok";
}
