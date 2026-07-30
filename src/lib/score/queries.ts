import "server-only";

import { getAnalyticsData } from "@/lib/analytics/queries";
import type { HealthResult } from "@/lib/finance/health-score";
import type { CurrencyCode } from "@/lib/format";

export interface ScoreData {
  health: HealthResult;
  /** Trailing-window savings rate (0–1), shown for context. */
  savingsRate: number;
  /** Net saved over the analytics window. */
  netSaved: number;
  currency: CurrencyCode;
}

/**
 * The Financial Score, derived from the same trailing-window analytics the
 * dashboard uses — so the number never disagrees between pages.
 */
export async function getScoreData(): Promise<ScoreData> {
  const analytics = await getAnalyticsData();
  return {
    health: analytics.health,
    savingsRate: analytics.totals.savingsRate,
    netSaved: analytics.totals.net,
    currency: analytics.currency,
  };
}
