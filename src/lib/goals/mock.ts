import { computeGoalProjection } from "@/lib/finance/goals";
import type { GoalWithProgress } from "./types";

const inMonths = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

/** Demo goals so the page renders without a configured backend. */
export const demoGoals: GoalWithProgress[] = [
  mk("Emergency Fund", "shield", 20000, 13500, 700, inMonths(10), "high"),
  mk("New Car", "car", 25000, 8200, 600, inMonths(30), "medium"),
  mk("Japan Trip", "plane", 6000, 2400, 400, inMonths(9), "medium"),
  mk("New Laptop", "laptop", 2500, 2500, 250, null, "low"),
];

function mk(
  name: string,
  icon: string,
  target: number,
  current: number,
  monthly: number,
  deadline: string | null,
  priority: GoalWithProgress["priority"],
): GoalWithProgress {
  const projection = computeGoalProjection({
    targetAmount: target,
    currentAmount: current,
    monthlyContribution: monthly,
    deadline,
  });
  return {
    id: `demo-${name}`,
    name,
    icon,
    targetAmount: target,
    currentAmount: current,
    currency: "USD",
    deadline,
    priority,
    monthlyContribution: monthly,
    status: projection.isComplete ? "completed" : "active",
    projection,
  };
}
