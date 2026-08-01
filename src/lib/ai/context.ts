/**
 * A compact, human-readable snapshot of the user's real finances, fed into
 * the AI prompt so answers are grounded in actual numbers instead of
 * generic advice. Composed entirely from already-decrypted/computed data —
 * see the "Resolved: the AI Assistant conflict" + Architecture shift
 * sections of docs/e2ee-path-b-plan.md: the server can no longer read
 * income/expenses itself, so this now runs client-side (in
 * ai-assistant-view.tsx) and the resulting string is sent to the
 * /api/v1/ai/ask relay alongside the plaintext vendor key — grounding
 * data, not a secret, but still only ever built where the vault is
 * unlocked.
 */

import { formatCurrency, formatPercent } from "@/lib/format";
import type { BudgetsData } from "@/lib/budgets/compute";
import type { AnalyticsData } from "@/lib/analytics/types";
import type { GoalsData } from "@/lib/goals/compute";
import type { LoansData } from "@/lib/loans/compute";
import type { InvestmentsData } from "@/lib/investments/queries";
import type { NetWorthData } from "@/lib/networth/types";

export function buildFinanceContext(input: {
  budgets: BudgetsData;
  goals: GoalsData;
  loans: LoansData;
  investments: InvestmentsData;
  analytics: AnalyticsData;
  netWorth: NetWorthData;
}): string {
  const { budgets, goals, loans, investments, analytics, netWorth } = input;
  const currency = budgets.currency;
  const money = (n: number) => formatCurrency(n, currency);
  const thisMonth = analytics.months[analytics.months.length - 1];

  const lines: string[] = [`Base currency: ${currency}`];

  lines.push(
    "",
    "SAFE TO SPEND (this month)",
    `- Remaining: ${money(budgets.safeToSpend.remaining)} of ${money(budgets.safeToSpend.safeToSpendMonthly)} safe-to-spend (${formatPercent(budgets.safeToSpend.utilization)} used)`,
    `- Per remaining day: ${money(budgets.safeToSpend.perRemainingDay)}`,
  );
  if (budgets.safeToSpend.overspent) {
    lines.push("- Already over the safe-to-spend limit this month.");
  }

  if (thisMonth) {
    lines.push(
      "",
      "THIS MONTH",
      `- Income: ${money(thisMonth.income)}, Expenses: ${money(thisMonth.expenses)}, Net: ${money(thisMonth.net)}`,
      `- Savings rate: ${formatPercent(thisMonth.savingsRate)}`,
    );
  }

  lines.push("", "BUDGETS BY CATEGORY");
  if (budgets.budgets.length === 0) {
    lines.push("- No budgets set.");
  } else {
    for (const b of budgets.budgets) {
      lines.push(
        `- ${b.categoryName ?? "Overall"}: ${money(b.spent)} spent of ${money(b.amount)} (${b.status})`,
      );
    }
  }

  lines.push("", "GOALS");
  if (goals.goals.length === 0) {
    lines.push("- No active savings goals.");
  } else {
    for (const g of goals.goals) {
      lines.push(
        `- ${g.name}: ${money(g.currentAmount)} of ${money(g.targetAmount)} (${g.status}${g.deadline ? `, due ${g.deadline}` : ""})`,
      );
    }
  }

  lines.push(
    "",
    "LOANS",
    loans.loans.length === 0
      ? "- No active loans."
      : `- Total remaining: ${money(loans.totalRemaining)}, monthly EMI: ${money(loans.totalMonthlyEmi)}`,
  );

  lines.push(
    "",
    "INVESTMENTS",
    investments.investments.length === 0
      ? "- No recorded investments."
      : `- Current value: ${money(investments.totalValue)}, invested: ${money(investments.totalInvested)}, gain/loss: ${money(investments.totalGain)}, monthly SIP: ${money(investments.monthlyContribution)}`,
  );

  lines.push(
    "",
    "NET WORTH",
    `- ${money(netWorth.result.netWorth)} (assets ${money(netWorth.result.totalAssets)}, liabilities ${money(netWorth.result.totalLiabilities)})`,
  );

  lines.push(
    "",
    "FINANCIAL HEALTH SCORE",
    `- ${analytics.health.score}/100 (${analytics.health.band})`,
  );

  return lines.join("\n");
}
