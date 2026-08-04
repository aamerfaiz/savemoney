/**
 * Savings-goal projection (pure).
 *
 * Given how much is saved, the target, an optional monthly contribution and an
 * optional deadline, work out progress, when the goal completes at the current
 * pace, and whether that pace keeps up with the deadline.
 */

export interface GoalProjectionInput {
  targetAmount: number;
  currentAmount: number;
  monthlyContribution?: number | null;
  deadline?: string | null; // ISO date
}

export interface GoalProjection {
  progress: number; // 0–1
  remaining: number;
  /** Months to reach the target at the current contribution (null if none). */
  monthsToGoal: number | null;
  /** ISO date the goal completes at the current pace (null if unknown). */
  expectedCompletion: string | null;
  /** Monthly amount needed to hit the deadline (null if no deadline). */
  requiredMonthly: number | null;
  /** True when the current contribution meets/exceeds what the deadline needs. */
  onTrack: boolean | null;
  isComplete: boolean;
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth()) +
    (to.getDate() >= from.getDate() ? 0 : -1)
  );
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function computeGoalProjection(
  input: GoalProjectionInput,
  now = new Date(),
): GoalProjection {
  const { targetAmount, currentAmount } = input;
  const monthly = input.monthlyContribution ?? 0;

  const progress =
    targetAmount > 0 ? Math.min(1, currentAmount / targetAmount) : 0;
  const remaining = Math.max(0, targetAmount - currentAmount);
  const isComplete = remaining <= 0;

  let monthsToGoal: number | null = null;
  let expectedCompletion: string | null = null;
  if (isComplete) {
    monthsToGoal = 0;
    expectedCompletion = now.toISOString().slice(0, 10);
  } else if (monthly > 0) {
    monthsToGoal = Math.ceil(remaining / monthly);
    expectedCompletion = addMonths(now, monthsToGoal).toISOString().slice(0, 10);
  }

  let requiredMonthly: number | null = null;
  let onTrack: boolean | null = null;
  if (input.deadline && !isComplete) {
    const monthsLeft = Math.max(1, monthsBetween(now, new Date(input.deadline)));
    requiredMonthly = remaining / monthsLeft;
    onTrack = monthly >= requiredMonthly;
  } else if (isComplete) {
    onTrack = true;
  }

  return {
    progress,
    remaining,
    monthsToGoal,
    expectedCompletion,
    requiredMonthly,
    onTrack,
    isComplete,
  };
}
