import "server-only";

import { getBudgetsData } from "@/lib/budgets/queries";
import { getGoalsData } from "@/lib/goals/queries";
import { getLoansData } from "@/lib/loans/queries";
import { getInvestmentsData } from "@/lib/investments/queries";
import { getAnalyticsData } from "@/lib/analytics/queries";
import { getNetWorthData } from "@/lib/networth/queries";
import { formatCurrency, formatPercent } from "@/lib/format";

/**
 * A compact, human-readable snapshot of the user's real finances, fed into
 * the AI prompt so answers are grounded in actual numbers instead of
 * generic advice. Composed entirely from the same module queries/finance
 * engines the dashboard uses (see AGENTS.md "Keep finance logic as pure
 * functions") — nothing here recomputes a number by hand.
 */
export async function buildFinanceContext(): Promise<string> {
  const [budgets, goals, loans, investments, analytics, netWorth] =
    await Promise.all([
      getBudgetsData(),
      getGoalsData(),
      getLoansData(),
      getInvestmentsData(),
      getAnalyticsData(),
      getNetWorthData(),
    ]);

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
