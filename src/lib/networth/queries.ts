import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDisplayCurrency } from "@/lib/profile/queries";
import { getInvestmentsData } from "@/lib/investments/queries";
import { getGoalsData } from "@/lib/goals/queries";
import { getLoansData } from "@/lib/loans/queries";
import { getAnalyticsData } from "@/lib/analytics/queries";
import { computeNetWorth, trendChange } from "@/lib/finance/net-worth";
import type { CurrencyCode } from "@/lib/format";
import { demoNetWorth } from "./mock";
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

/** Net worth for the standalone page. Composed from the module queries. */
export async function getNetWorthData(): Promise<NetWorthData> {
  const currency = await getDisplayCurrency();
  if (!isSupabaseConfigured()) return demoNetWorth(currency);

  const supabase = await createClient();
  const [investments, goals, loans, analytics, snapshots] = await Promise.all([
    getInvestmentsData(),
    getGoalsData(),
    getLoansData(),
    getAnalyticsData(),
    fetchNetWorthSnapshots(supabase),
  ]);

  return buildNetWorth({
    components: {
      investmentsValue: investments.totalValue,
      goalsSaved: goals.totalSaved,
      loansRemaining: loans.totalRemaining,
    },
    months: analytics.months,
    snapshots,
    currency,
  });
}

/** Recent persisted snapshots, newest first. Shared with the dashboard. */
export async function fetchNetWorthSnapshots(
  supabase: SupabaseClient,
): Promise<SnapshotSummary[]> {
  const { data } = await supabase
    .from("net_worth_snapshots")
    .select("id, captured_at, total_assets, total_liabilities, net_worth, note")
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .limit(24);

  return (
    (data ?? []) as {
      id: string;
      captured_at: string;
      total_assets: string | number;
      total_liabilities: string | number;
      net_worth: string | number;
      note: string | null;
    }[]
  ).map((s) => ({
    id: s.id,
    capturedAt: s.captured_at,
    totalAssets: Number(s.total_assets),
    totalLiabilities: Number(s.total_liabilities),
    netWorth: Number(s.net_worth),
    note: s.note,
  }));
}

function shortMonth(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(
    new Date(iso + "T00:00:00"),
  );
}
