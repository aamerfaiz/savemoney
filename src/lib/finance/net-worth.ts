/**
 * Net worth composition (pure).
 *
 * Net worth = total assets − total liabilities. This engine takes already-
 * summed components from the other modules (investments, goals, loans, and
 * later cash accounts) and produces the totals, the debt-to-asset ratio, and
 * an ordered breakdown for display. Kept dependency-free so the dashboard,
 * the Net Worth page and the future Reports module can all reuse it.
 */

export type NetWorthKind = "asset" | "liability";

export interface NetWorthComponentInput {
  key: string;
  label: string;
  icon: string;
  amount: number;
  kind: NetWorthKind;
}

export interface NetWorthComponent extends NetWorthComponentInput {
  /** Share of its side (assets or liabilities), 0–1. */
  share: number;
}

export interface NetWorthResult {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  /** liabilities / assets (0 when there are no assets). */
  debtToAssetRatio: number;
  assets: NetWorthComponent[];
  liabilities: NetWorthComponent[];
}

export function computeNetWorth(
  components: NetWorthComponentInput[],
): NetWorthResult {
  // Ignore zero/empty rows so the breakdown stays meaningful.
  const present = components.filter((c) => Math.abs(c.amount) > 0.005);

  const totalAssets = present
    .filter((c) => c.kind === "asset")
    .reduce((s, c) => s + c.amount, 0);
  const totalLiabilities = present
    .filter((c) => c.kind === "liability")
    .reduce((s, c) => s + c.amount, 0);

  const withShare = (c: NetWorthComponentInput): NetWorthComponent => {
    const denom = c.kind === "asset" ? totalAssets : totalLiabilities;
    return { ...c, share: denom > 0 ? c.amount / denom : 0 };
  };

  const assets = present
    .filter((c) => c.kind === "asset")
    .sort((a, b) => b.amount - a.amount)
    .map(withShare);
  const liabilities = present
    .filter((c) => c.kind === "liability")
    .sort((a, b) => b.amount - a.amount)
    .map(withShare);

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    debtToAssetRatio: totalAssets > 0 ? totalLiabilities / totalAssets : 0,
    assets,
    liabilities,
  };
}

export interface TrendPoint {
  month: string;
  value: number;
}

/**
 * Period-over-period change from a trend series (absolute + fraction of the
 * previous point). Safe when the series is short or the previous value is 0.
 */
export function trendChange(trend: TrendPoint[]): {
  change: number;
  changePct: number;
} {
  if (trend.length < 2) return { change: 0, changePct: 0 };
  const last = trend[trend.length - 1].value;
  const prev = trend[trend.length - 2].value;
  const change = last - prev;
  return { change, changePct: prev !== 0 ? change / Math.abs(prev) : 0 };
}
