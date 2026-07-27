import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { computeGoalProjection } from "@/lib/finance/goals";
import type { CurrencyCode } from "@/lib/format";
import { demoGoals } from "./mock";
import type {
  GoalPriority,
  GoalStatus,
  GoalWithProgress,
} from "./types";

export interface GoalsData {
  goals: GoalWithProgress[];
  totalSaved: number;
  totalTarget: number;
  currency: CurrencyCode;
}

interface GoalRow {
  id: string;
  name: string;
  icon: string | null;
  target_amount: string | number;
  current_amount: string | number;
  currency: string;
  deadline: string | null;
  priority: string;
  monthly_contribution: string | number | null;
  status: string;
}

const PRIORITY_RANK: Record<GoalPriority, number> = { high: 0, medium: 1, low: 2 };

/** Goals with progress + projection, sorted by priority then soonest deadline. */
export async function getGoalsData(): Promise<GoalsData> {
  const goals = isSupabaseConfigured() ? await fetchGoals() : demoGoals;

  const active = goals.filter((g) => g.status === "active" || g.status === "completed");
  const totalSaved = active.reduce((s, g) => s + g.currentAmount, 0);
  const totalTarget = active.reduce((s, g) => s + g.targetAmount, 0);

  return {
    goals,
    totalSaved,
    totalTarget,
    currency: goals[0]?.currency ?? "USD",
  };
}

async function fetchGoals(): Promise<GoalWithProgress[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("goals")
    .select(
      "id, name, icon, target_amount, current_amount, currency, deadline, priority, monthly_contribution, status",
    )
    .is("deleted_at", null);

  const goals = ((data ?? []) as GoalRow[]).map(mapRow);

  goals.sort((a, b) => {
    if (a.priority !== b.priority)
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (a.deadline && b.deadline) return a.deadline < b.deadline ? -1 : 1;
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
  return goals;
}

function mapRow(g: GoalRow): GoalWithProgress {
  const targetAmount = Number(g.target_amount);
  const currentAmount = Number(g.current_amount);
  const monthlyContribution =
    g.monthly_contribution == null ? null : Number(g.monthly_contribution);
  const projection = computeGoalProjection({
    targetAmount,
    currentAmount,
    monthlyContribution,
    deadline: g.deadline,
  });
  return {
    id: g.id,
    name: g.name,
    icon: g.icon,
    targetAmount,
    currentAmount,
    currency: (g.currency as CurrencyCode) ?? "USD",
    deadline: g.deadline,
    priority: g.priority as GoalPriority,
    monthlyContribution,
    status: g.status as GoalStatus,
    projection,
  };
}
