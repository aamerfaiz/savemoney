import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Packed-ciphertext row straight off the `goals` table (Phase 3.5.4, see
 * docs/e2ee-path-b-plan.md) — `targetAmount`/`currentAmount`/
 * `monthlyContribution` need the vault DEK to read, so no computation
 * (sorting, projection, totals) happens here anymore. See
 * src/lib/goals/compute.ts, which takes over once the client has decrypted
 * these via src/lib/finance/decrypt.ts's `decryptGoalRows`.
 */
export interface RawGoalRow {
  id: string;
  name: string;
  icon: string | null;
  targetAmount: string;
  currentAmount: string;
  currency: string;
  deadline: string | null;
  priority: string;
  monthlyContribution: string | null;
  status: string;
}

interface GoalSel {
  id: string;
  name: string;
  icon: string | null;
  target_amount: string;
  current_amount: string;
  currency: string;
  deadline: string | null;
  priority: string;
  monthly_contribution: string | null;
  status: string;
}

export async function fetchGoalsRaw(): Promise<RawGoalRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("goals")
    .select(
      "id, name, icon, target_amount, current_amount, currency, deadline, priority, monthly_contribution, status",
    )
    .is("deleted_at", null);

  return ((data ?? []) as GoalSel[]).map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    targetAmount: g.target_amount,
    currentAmount: g.current_amount,
    currency: g.currency,
    deadline: g.deadline,
    priority: g.priority,
    monthlyContribution: g.monthly_contribution,
    status: g.status,
  }));
}
