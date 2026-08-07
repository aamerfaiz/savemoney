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

/* ----------------------------------------------------------------------- */
/* Trip ledger (Splitwise-style "who paid what, who owes whom") — the      */
/* second collection type. No pool, no collected/remaining: every dollar   */
/* moves as either an expense (paid by one or more people, split between   */
/* one or more people) or a direct settlement between two people.          */
/* ----------------------------------------------------------------------- */

export interface TripExpensePayerInput {
  contributorId: string;
  amount: number;
}

export interface TripExpenseSplitInput {
  contributorId: string;
  amount: number;
}

export interface TripExpenseBalanceInput {
  payers: TripExpensePayerInput[];
  splits: TripExpenseSplitInput[];
}

export interface TripSettlementInput {
  fromContributorId: string;
  toContributorId: string;
  amount: number;
}

export interface ContributorBalance {
  contributorId: string;
  /** Total this person fronted across every expense's payer list. */
  paid: number;
  /** Total of this person's share across every expense's split list. */
  owed: number;
  /**
   * Net position after settlements: positive means the group owes this
   * person money (they fronted more than their share), negative means this
   * person owes the group. `paid - owed`, then a settlement they paid out
   * moves it toward zero (or positive) and one they received moves it
   * toward zero (or negative) — see `computeTripBalances`.
   */
  net: number;
}

/** Rounds to cents, avoiding the -0 a plain `Math.round` can produce for
 *  tiny negative values that should display as "settled up". */
function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

/**
 * Net balance per contributor across every trip expense's payers/splits and
 * every recorded settlement — the core Splitwise mechanic. Pure function of
 * already-decrypted amounts; nothing here reads or writes anything.
 */
export function computeTripBalances(
  expenses: TripExpenseBalanceInput[],
  settlements: TripSettlementInput[],
): ContributorBalance[] {
  const totals = new Map<string, { paid: number; owed: number; settledOut: number; settledIn: number }>();
  const ensure = (id: string) => {
    let t = totals.get(id);
    if (!t) {
      t = { paid: 0, owed: 0, settledOut: 0, settledIn: 0 };
      totals.set(id, t);
    }
    return t;
  };

  for (const expense of expenses) {
    for (const payer of expense.payers) ensure(payer.contributorId).paid += payer.amount;
    for (const split of expense.splits) ensure(split.contributorId).owed += split.amount;
  }
  for (const settlement of settlements) {
    ensure(settlement.fromContributorId).settledOut += settlement.amount;
    ensure(settlement.toContributorId).settledIn += settlement.amount;
  }

  return [...totals.entries()].map(([contributorId, t]) => ({
    contributorId,
    paid: round2(t.paid),
    owed: round2(t.owed),
    net: round2(t.paid - t.owed + t.settledOut - t.settledIn),
  }));
}

export interface SuggestedSettlement {
  fromContributorId: string;
  toContributorId: string;
  amount: number;
}

/**
 * Greedy debt simplification: repeatedly matches the largest creditor
 * against the largest debtor until everyone nets to zero. Not the
 * theoretical minimum number of transactions in every case, but it's what
 * Splitwise itself uses and is simple enough to reason about — good enough
 * for a group of friends, not a payments clearinghouse.
 */
export function simplifySettlements(
  balances: Pick<ContributorBalance, "contributorId" | "net">[],
): SuggestedSettlement[] {
  const EPS = 0.005;
  const creditors = balances
    .filter((b) => b.net > EPS)
    .map((b) => ({ id: b.contributorId, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = balances
    .filter((b) => b.net < -EPS)
    .map((b) => ({ id: b.contributorId, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);

  const result: SuggestedSettlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(debtor.amount, creditor.amount));
    if (amount > EPS) {
      result.push({ fromContributorId: debtor.id, toContributorId: creditor.id, amount });
    }
    debtor.amount = round2(debtor.amount - amount);
    creditor.amount = round2(creditor.amount - amount);
    if (debtor.amount <= EPS) i++;
    if (creditor.amount <= EPS) j++;
  }
  return result;
}
