import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getAnalyticsData } from "@/lib/analytics/queries";
import { getInvestmentsData } from "@/lib/investments/queries";
import { getGoalsData } from "@/lib/goals/queries";
import { getLoansData } from "@/lib/loans/queries";
import { buildNetWorth, fetchNetWorthSnapshots } from "@/lib/networth/queries";
import type { HealthResult } from "@/lib/finance/health-score";
import type { CurrencyCode } from "@/lib/format";
import type { CategorySlice, MonthPoint } from "@/lib/analytics/types";

export interface ReportsData {
  /** Trailing months, oldest → newest. */
  months: MonthPoint[];
  monthsCount: number;
  /** Category spend aggregated over the whole window. */
  byCategory: CategorySlice[];
  health: HealthResult;
  netWorth: number;
  netWorthChangePct: number;
  currency: CurrencyCode;
  /** ISO date the report was generated. */
  generatedAt: string;
}

/** Everything the Reports page composes — analytics + net worth + score. */
export async function getReportsData(): Promise<ReportsData> {
  const [analytics, investments, goals, loans] = await Promise.all([
    getAnalyticsData(),
    getInvestmentsData(),
    getGoalsData(),
    getLoansData(),
  ]);

  const snapshots = isSupabaseConfigured()
    ? await fetchNetWorthSnapshots(await createClient())
    : [];

  const nw = buildNetWorth({
    components: {
      investmentsValue: investments.totalValue,
      goalsSaved: goals.totalSaved,
      loansRemaining: loans.totalRemaining,
    },
    months: analytics.months,
    snapshots,
    currency: analytics.currency,
  });

  return {
    months: analytics.months,
    monthsCount: analytics.monthsCount,
    byCategory: analytics.byCategory,
    health: analytics.health,
    netWorth: nw.result.netWorth,
    netWorthChangePct: nw.changePct,
    currency: analytics.currency,
    generatedAt: new Date().toISOString().slice(0, 10),
  };
}
