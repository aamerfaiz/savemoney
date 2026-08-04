import { Icon } from "@/components/icon";
import type { Transaction } from "@/data/mock-dashboard";
import {
  formatCurrency,
  formatDateShort,
  type CurrencyCode,
} from "@savemoney/finance-engine/format";
import { cn } from "@/lib/utils";

export function RecentTransactions({
  items,
  currency,
}: {
  items: Transaction[];
  currency: CurrencyCode;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Recent transactions
        </span>
        <span className="text-xs text-brand">View all</span>
      </div>
      <ul className="flex-1 divide-y divide-border">
        {items.map((t) => {
          const income = t.amount > 0;
          return (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full",
                  income
                    ? "bg-positive/15 text-positive"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon name={t.icon} className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t.category} · {formatDateShort(t.date)}
                </div>
              </div>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  income ? "text-positive" : "text-foreground",
                )}
              >
                {formatCurrency(t.amount, currency, { showSign: true })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
