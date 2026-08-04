import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type {
  NetWorthResult,
  TrendPoint,
} from "@savemoney/finance-engine/net-worth";

/** A persisted point-in-time capture, shaped for the history list. */
export interface SnapshotSummary {
  id: string;
  capturedAt: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  note: string | null;
}

export interface NetWorthData {
  /** Full assets/liabilities breakdown + totals. */
  result: NetWorthResult;
  /** Net-worth series — real snapshots when available, else reconstructed. */
  trend: TrendPoint[];
  /** True when `trend` is built from persisted snapshots (vs reconstructed). */
  fromSnapshots: boolean;
  change: number;
  changePct: number;
  /** Recent persisted snapshots, newest first (empty in demo / when none). */
  snapshots: SnapshotSummary[];
  currency: CurrencyCode;
}
