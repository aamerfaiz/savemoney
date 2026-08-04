import { z } from "zod";

import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { GoalProjection } from "@savemoney/finance-engine/goals";

export type GoalPriority = "low" | "medium" | "high";
export type GoalStatus = "active" | "paused" | "completed" | "cancelled";

export interface GoalWithProgress {
  id: string;
  name: string;
  icon: string | null;
  targetAmount: number;
  currentAmount: number;
  currency: CurrencyCode;
  deadline: string | null;
  priority: GoalPriority;
  monthlyContribution: number | null;
  status: GoalStatus;
  projection: GoalProjection;
}

export const GOAL_PRIORITIES = ["low", "medium", "high"] as const;
export const GOAL_STATUSES = ["active", "paused", "completed", "cancelled"] as const;

/** Icon choices offered when creating a goal. */
export const GOAL_ICONS = [
  "target",
  "car",
  "home",
  "plane",
  "graduation-cap",
  "shield",
  "laptop",
  "coins",
] as const;

export const goalInputSchema = z.object({
  name: z.string().trim().min(1, "Give your goal a name").max(80),
  icon: z.string().max(40).optional().nullable(),
  targetAmount: z.coerce
    .number()
    .positive("Target must be greater than zero")
    .max(1_000_000_000),
  currentAmount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  currency: z.string().length(3).default("USD"),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  priority: z.enum(GOAL_PRIORITIES).default("medium"),
  monthlyContribution: z.coerce
    .number()
    .min(0)
    .max(1_000_000_000)
    .optional()
    .nullable(),
});

export type GoalInput = z.infer<typeof goalInputSchema>;

export const contributionInputSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  contributedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(200).optional().nullable(),
});

export type ContributionInput = z.infer<typeof contributionInputSchema>;
