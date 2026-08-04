/** Direct port of apps/web/src/lib/networth/compute.ts — pure, unchanged. */

import { computeNetWorth, trendChange } from "@savemoney/finance-engine/net-worth";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { NetWorthData, SnapshotSummary } from "./types";

export interface NetWorthComponents {
  investmentsValue: number;
  goalsSaved: number;
  loansRemaining: number;
}

export function buildNetWorth(input: {
  components: NetWorthComponents;
  months: { label: string; net: number }[];
  snapshots: SnapshotSummary[];
  currency: CurrencyCode;
}): NetWorthData {
  const { components, months, snapshots, currency } = input;

  const result = computeNetWorth([
    {
      key: "investments",
      label: "Investments",
      icon: "trending-up",
      amount: components.investmentsValue,
      kind: "asset",
    },
    {
      key: "goals",
      label: "Goal savings",
      icon: "target",
      amount: components.goalsSaved,
      kind: "asset",
    },
    {
      key: "loans",
      label: "Loans",
      icon: "landmark",
      amount: components.loansRemaining,
      kind: "liability",
    },
  ]);

  let trend: { month: string; value: number }[];
  let fromSnapshots: boolean;

  const asc = [...snapshots].reverse();
  if (asc.length >= 2) {
    trend = asc.slice(-8).map((s) => ({ month: shortMonth(s.capturedAt), value: Math.round(s.netWorth) }));
    if (trend.length > 0) trend[trend.length - 1].value = Math.round(result.netWorth);
    fromSnapshots = true;
  } else {
    trend = [];
    let running = result.netWorth;
    for (let i = months.length - 1; i >= 0; i--) {
      trend.unshift({ month: months[i].label, value: Math.round(running) });
      running -= months[i].net;
    }
    fromSnapshots = false;
  }

  const { change, changePct } = trendChange(trend);
  return { result, trend, fromSnapshots, change, changePct, snapshots, currency };
}

function shortMonth(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(iso + "T00:00:00"));
}
