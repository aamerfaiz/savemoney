/**
 * Pure financial-score composition (Phase 3.5.3) — the exact logic that
 * used to live in getScoreData(), unchanged, now taking already-computed
 * analytics instead of fetching it itself.
 */

import type { HealthResult } from "@savemoney/finance-engine/health-score";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { AnalyticsData } from "@/lib/analytics/types";

export interface ScoreData {
  health: HealthResult;
  savingsRate: number;
  netSaved: number;
  currency: CurrencyCode;
}

export function computeScoreData(analytics: AnalyticsData): ScoreData {
  return {
    health: analytics.health,
    savingsRate: analytics.totals.savingsRate,
    netSaved: analytics.totals.net,
    currency: analytics.currency,
  };
}
