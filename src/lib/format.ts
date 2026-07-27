/**
 * Formatting helpers for money, percentages and dates.
 * All currency formatting is currency-code driven so the multi-currency
 * module can slot in later without touching call sites.
 */

export type CurrencyCode = "USD" | "EUR" | "GBP" | "INR" | "AED" | "JPY";

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

/** Format a numeric amount as currency (no fractional digits by default). */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  opts: { compact?: boolean; showSign?: boolean } = {},
): string {
  const { compact = false, showSign = false } = opts;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : Math.abs(amount) < 100 ? 2 : 0,
    signDisplay: showSign ? "exceptZero" : "auto",
  });
  return formatter.format(amount);
}

/** Compact currency, e.g. $12.4k — handy for tight metric tiles. */
export function formatCompact(
  amount: number,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): string {
  return formatCurrency(amount, currency, { compact: true });
}

/** Format a 0–1 ratio (or already-scaled percent) as a percentage string. */
export function formatPercent(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Short human date, e.g. "Jul 27". */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Days from today until `date` (negative = overdue). */
export function daysUntil(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
