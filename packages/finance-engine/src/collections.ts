/**
 * Contribution-pool summary (pure) — Splitwise-inspired but single-organizer:
 * one person tracks a roster of participants, what each put into a shared
 * pool (e.g. office gift money), and what's been spent out of it, never a
 * multi-user shared ledger. Every total is derived by summing rows rather
 * than stored, so there's nothing to keep in sync.
 */

export interface CollectionContributionInput {
  amount: number;
}

export interface CollectionExpenseInput {
  amount: number;
}

export interface CollectionSummary {
  totalCollected: number;
  contributorCount: number;
  targetAmount: number | null;
  /** null when there's no target — "remaining" is meaningless without one. */
  remaining: number | null;
  /** 0–1, null when there's no target. Fundraising progress vs. target. */
  progress: number | null;
  averageContribution: number;
  isFullyFunded: boolean;
  /** Money spent out of the pool so far. */
  totalSpent: number;
  /** totalCollected − totalSpent. Negative when overspent. */
  balance: number;
  /** totalSpent / totalCollected, 0 when nothing's been collected yet.
   * Unclamped — can exceed 1 when overspent; callers clamp for a bar. */
  spentProgress: number;
  isOverspent: boolean;
}

export function computeCollectionSummary(
  contributions: CollectionContributionInput[],
  expenses: CollectionExpenseInput[],
  targetAmount: number | null,
): CollectionSummary {
  const totalCollected = contributions.reduce((sum, c) => sum + c.amount, 0);
  const contributorCount = contributions.length;
  const remaining = targetAmount != null ? Math.max(0, targetAmount - totalCollected) : null;
  const progress =
    targetAmount != null && targetAmount > 0 ? Math.min(1, totalCollected / targetAmount) : null;
  const averageContribution = contributorCount > 0 ? totalCollected / contributorCount : 0;
  const isFullyFunded = targetAmount != null && totalCollected >= targetAmount;

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const balance = totalCollected - totalSpent;
  const spentProgress = totalCollected > 0 ? totalSpent / totalCollected : 0;
  const isOverspent = totalSpent > totalCollected;

  return {
    totalCollected,
    contributorCount,
    targetAmount,
    remaining,
    progress,
    averageContribution,
    isFullyFunded,
    totalSpent,
    balance,
    spentProgress,
    isOverspent,
  };
}
