/**
 * Pure net-worth composition (Phase 3.5.3) — split out of queries.ts so it's
 * callable from client code. queries.ts keeps "server-only" for its actual
 * I/O (fetchNetWorthSnapshots); this file has none.
 */

import { computeNetWorth, trendChange } from "@savemoney/finance-engine/net-worth";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { NetWorthData, SnapshotSummary } from "./types";

/** The three sources that make up net worth today (accounts land later). */
export interface NetWorthComponents {
  investmentsValue: number;
  goalsSaved: number;
  loansRemaining: number;
}

/**
 * Compose net worth (pure). The breakdown comes from live module totals; the
 * trend prefers real persisted snapshots and falls back to reconstructing the
 * last few months from net cash flow anchored to the current net worth.
 */
export function buildNetWorth(input: {
  components: NetWorthComponents;
  months: { label: string; net: number }[];
  snapshots: SnapshotSummary[]; // newest first
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

  const asc = [...snapshots].reverse(); // oldest first
  if (asc.length >= 2) {
    trend = asc
      .slice(-8)
      .map((s) => ({ month: shortMonth(s.capturedAt), value: Math.round(s.netWorth) }));
    // Anchor the final point to today's live net worth.
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
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(
    new Date(iso + "T00:00:00"),
  );
}
