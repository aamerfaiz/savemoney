import type { AnalyticsData } from "@/lib/analytics/types";

import type { ReferenceData } from "../capabilities/shared";

/** How many multiples of the baseline counts as "unusually large" — soft,
 * non-blocking, per docs/ai-smart-entry-plan.md. */
const FACTOR = 3;

/**
 * Pure comparison against history already fetched by the caller — never
 * fetches anything itself, never blocks a draft, only ever returns a
 * warning string or `null`.
 */
export function checkAnomaly(
  capabilityKey: string,
  fields: Record<string, unknown>,
  targetLabel: string | undefined,
  ref: ReferenceData,
  analytics: AnalyticsData | null,
): string | null {
  const amount = typeof fields.amount === "number" ? fields.amount : Number(fields.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (capabilityKey === "transaction.expense" && analytics) {
    const categoryId = fields.categoryId as string | null | undefined;
    const category = categoryId
      ? ref.expenseCategories.find((c) => c.id === categoryId)
      : null;
    const slice = category
      ? analytics.byCategory.find((c) => c.category === category.name)
      : null;
    const baseline = slice
      ? slice.amount / analytics.monthsCount
      : analytics.totals.avgMonthlyExpense;
    return overThreshold(
      amount,
      baseline,
      `This is unusually large${category ? ` for ${category.name}` : ""} compared to your recent average.`,
    );
  }

  if (capabilityKey === "transaction.income" && analytics) {
    const baseline = analytics.totals.income / analytics.monthsCount;
    return overThreshold(amount, baseline, "This is unusually large compared to your recent average income.");
  }

  if (capabilityKey === "investment.contribution") {
    const investment = ref.investments.find((i) => i.name === targetLabel);
    if (investment?.typicalAmount) {
      return overThreshold(
        amount,
        investment.typicalAmount,
        `This is much larger than ${targetLabel}'s usual monthly contribution.`,
      );
    }
  }

  if (capabilityKey === "loan.payment" && fields.isExtra !== true) {
    const loan = ref.loans.find((l) => l.name === targetLabel);
    if (loan?.typicalAmount) {
      return overThreshold(amount, loan.typicalAmount, `This is much larger than ${targetLabel}'s usual EMI.`);
    }
  }

  if (capabilityKey === "goal.contribution") {
    const goal = ref.goals.find((g) => g.name === targetLabel);
    if (goal?.typicalAmount) {
      return overThreshold(
        amount,
        goal.typicalAmount,
        `This is much larger than ${targetLabel}'s usual monthly contribution.`,
      );
    }
  }

  return null;
}

function overThreshold(amount: number, baseline: number, message: string): string | null {
  return baseline > 0 && amount > baseline * FACTOR ? message : null;
}
