/**
 * Pure reports composition (Phase 3.5.3) — the exact logic that used to
 * live in getReportsData(), unchanged, now taking already-computed
 * analytics + net worth instead of fetching them itself.
 */

import { buildNetWorth } from "@/lib/networth/compute";
import type { CurrencyCode } from "@/lib/format";
import type { AnalyticsData } from "@/lib/analytics/types";
import type { HealthResult } from "@/lib/finance/health-score";
import type { CategorySlice, MonthPoint } from "@/lib/analytics/types";
import type { GoalsData } from "@/lib/goals/compute";
import type { LoansData } from "@/lib/loans/compute";
import type { InvestmentsData } from "@/lib/investments/queries";
import type { SnapshotSummary } from "@/lib/networth/types";

export interface ReportsData {
  months: MonthPoint[];
  monthsCount: number;
  byCategory: CategorySlice[];
  health: HealthResult;
  netWorth: number;
  netWorthChangePct: number;
  currency: CurrencyCode;
  generatedAt: string;
}

export function computeReportsData(input: {
  analytics: AnalyticsData;
  investmentsData: InvestmentsData;
  goalsData: GoalsData;
  loansData: LoansData;
  snapshots: SnapshotSummary[];
}): ReportsData {
  const { analytics, investmentsData, goalsData, loansData, snapshots } = input;

  const nw = buildNetWorth({
    components: {
      investmentsValue: investmentsData.totalValue,
      goalsSaved: goalsData.totalSaved,
      loansRemaining: loansData.totalRemaining,
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
