import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { NetWorthResult, TrendPoint } from "@savemoney/finance-engine/net-worth";

/** Direct port of apps/web/src/lib/networth/types.ts. */
export interface SnapshotSummary {
  id: string;
  capturedAt: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  note: string | null;
}

export interface NetWorthData {
  result: NetWorthResult;
  trend: TrendPoint[];
  fromSnapshots: boolean;
  change: number;
  changePct: number;
  snapshots: SnapshotSummary[];
  currency: CurrencyCode;
}
