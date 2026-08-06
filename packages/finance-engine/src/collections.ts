/**
 * Contribution-pool summary (pure) — Splitwise-inspired but single-organizer:
 * one person tracks named contributors and what each put toward a shared
 * pool (e.g. office gift money), never a multi-user shared ledger. The
 * running total is always derived by summing contributions rather than
 * stored, so there's nothing to keep in sync.
 */

export interface CollectionContributionInput {
  amount: number;
}

export interface CollectionSummary {
  totalCollected: number;
  contributorCount: number;
  targetAmount: number | null;
  /** null when there's no target — "remaining" is meaningless without one. */
  remaining: number | null;
  /** 0–1, null when there's no target. */
  progress: number | null;
  averageContribution: number;
  isFullyFunded: boolean;
}

export function computeCollectionSummary(
  contributions: CollectionContributionInput[],
  targetAmount: number | null,
): CollectionSummary {
  const totalCollected = contributions.reduce((sum, c) => sum + c.amount, 0);
  const contributorCount = contributions.length;
  const remaining = targetAmount != null ? Math.max(0, targetAmount - totalCollected) : null;
  const progress =
    targetAmount != null && targetAmount > 0 ? Math.min(1, totalCollected / targetAmount) : null;
  const averageContribution = contributorCount > 0 ? totalCollected / contributorCount : 0;
  const isFullyFunded = targetAmount != null && totalCollected >= targetAmount;

  return {
    totalCollected,
    contributorCount,
    targetAmount,
    remaining,
    progress,
    averageContribution,
    isFullyFunded,
  };
}
