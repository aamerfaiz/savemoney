import { computeNetWorth, trendChange } from "@/lib/finance/net-worth";
import { demoInvestments } from "@/lib/investments/mock";
import { demoGoals } from "@/lib/goals/mock";
import { demoLoans } from "@/lib/loans/mock";
import type { CurrencyCode } from "@/lib/format";
import type { NetWorthData } from "./types";

/** Demo net worth composed from the other modules' demo data. */
export function demoNetWorth(currency: CurrencyCode): NetWorthData {
  const investmentsValue = demoInvestments.reduce(
    (s, i) => s + i.currentValue,
    0,
  );
  const goalsSaved = demoGoals
    .filter((g) => g.status === "active" || g.status === "completed")
    .reduce((s, g) => s + g.currentAmount, 0);
  const loansRemaining = demoLoans.reduce((s, l) => s + l.remainingAmount, 0);

  const result = computeNetWorth([
    {
      key: "investments",
      label: "Investments",
      icon: "trending-up",
      amount: investmentsValue,
      kind: "asset",
    },
    {
      key: "goals",
      label: "Goal savings",
      icon: "target",
      amount: goalsSaved,
      kind: "asset",
    },
    {
      key: "loans",
      label: "Loans",
      icon: "landmark",
      amount: loansRemaining,
      kind: "liability",
    },
  ]);

  // A gently rising six-month trajectory anchored on the current figure.
  const labels = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];
  const netFlow = [2100, 1800, 2600, 1500, 2400, 2200]; // per-month net cash flow
  const trend: { month: string; value: number }[] = [];
  let running = result.netWorth;
  for (let i = labels.length - 1; i >= 0; i--) {
    trend.unshift({ month: labels[i], value: Math.round(running) });
    running -= netFlow[i];
  }

  const { change, changePct } = trendChange(trend);
  return {
    result,
    trend,
    fromSnapshots: false,
    change,
    changePct,
    snapshots: [],
    currency,
  };
}
