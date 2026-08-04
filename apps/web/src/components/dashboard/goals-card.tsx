import { Icon } from "@/components/icon";
import type { GoalSummary } from "@/data/mock-dashboard";
import { formatCurrency, formatPercent, type CurrencyCode } from "@savemoney/finance-engine/format";

export function GoalsCard({
  goals,
  currency,
}: {
  goals: GoalSummary[];
  currency: CurrencyCode;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Savings goals
        </span>
        <span className="text-xs text-brand">{goals.length} active</span>
      </div>
      <ul className="flex-1 space-y-3.5">
        {goals.map((g) => {
          const pct = Math.min(1, g.saved / g.target);
          return (
            <li key={g.id} className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="flex size-7 items-center justify-center rounded-md bg-muted text-brand">
                  <Icon name={g.icon} className="size-4" />
                </span>
                <span className="flex-1 truncate font-medium">{g.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatPercent(pct)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {formatCurrency(g.saved, currency)} /{" "}
                {formatCurrency(g.target, currency)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
