import type { BudgetResult } from "@/lib/finance/budget";
import { formatCurrency, type CurrencyCode } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "Safe to spend" summary with a utilisation meter. */
export function BudgetCard({
  budget,
  currency,
}: {
  budget: BudgetResult;
  currency: CurrencyCode;
}) {
  const pct = Math.min(100, Math.round(budget.utilization * 100));
  const over = budget.overspent || budget.utilization > 1;
  const meterColor = over
    ? "var(--color-negative)"
    : budget.utilization > 0.8
      ? "var(--color-warning)"
      : "var(--color-brand)";

  return (
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Safe to spend
          </span>
          <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {formatCurrency(budget.remaining, currency)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            of {formatCurrency(budget.safeToSpendMonthly, currency)} this month
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground">Per day left</span>
          <div className="text-lg font-semibold tabular-nums">
            {formatCurrency(budget.perRemainingDay, currency)}
          </div>
        </div>
      </div>

      <div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%`, backgroundColor: meterColor }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={cn("font-medium", over && "text-negative")}>
            {pct}% used
          </span>
          <span className="text-muted-foreground">
            {formatCurrency(budget.dailyBudget, currency)}/day ·{" "}
            {formatCurrency(budget.weeklyBudget, currency)}/wk
          </span>
        </div>
      </div>
    </div>
  );
}
