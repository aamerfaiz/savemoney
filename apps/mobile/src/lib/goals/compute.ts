/** Direct port of apps/web/src/lib/goals/compute.ts — pure, unchanged. */

import { computeGoalProjection } from "@savemoney/finance-engine/goals";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { DecryptedGoalRow } from "../finance/decrypt";
import type { GoalPriority, GoalStatus, GoalWithProgress } from "./types";

export interface GoalsData {
  goals: GoalWithProgress[];
  totalSaved: number;
  totalTarget: number;
  currency: CurrencyCode;
}

const PRIORITY_RANK: Record<GoalPriority, number> = { high: 0, medium: 1, low: 2 };

export function computeGoalsData(
  rows: DecryptedGoalRow[],
  currency: CurrencyCode,
  now = new Date(),
): GoalsData {
  const goals: GoalWithProgress[] = rows.map((g) => {
    const projection = computeGoalProjection(
      {
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
        monthlyContribution: g.monthlyContribution,
        deadline: g.deadline,
      },
      now,
    );
    return {
      id: g.id,
      name: g.name,
      icon: g.icon,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      currency,
      deadline: g.deadline,
      priority: g.priority as GoalPriority,
      monthlyContribution: g.monthlyContribution,
      status: g.status as GoalStatus,
      projection,
    };
  });

  goals.sort((a, b) => {
    if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (a.deadline && b.deadline) return a.deadline < b.deadline ? -1 : 1;
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  const active = goals.filter((g) => g.status === "active" || g.status === "completed");
  const totalSaved = active.reduce((s, g) => s + g.currentAmount, 0);
  const totalTarget = active.reduce((s, g) => s + g.targetAmount, 0);

  return { goals, totalSaved, totalTarget, currency };
}
