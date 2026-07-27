import { CalendarClock, Landmark, Receipt } from "lucide-react";

import type { UpcomingItem } from "@/data/mock-dashboard";
import {
  daysUntil,
  formatCurrency,
  formatDateShort,
  type CurrencyCode,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function UpcomingCard({
  items,
  currency,
}: {
  items: UpcomingItem[];
  currency: CurrencyCode;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <CalendarClock className="size-4" />
        Upcoming bills &amp; EMI
      </div>
      <ul className="flex-1 space-y-2.5">
        {items.map((item) => {
          const days = daysUntil(item.dueDate);
          const soon = days <= 3;
          const Icon = item.kind === "emi" ? Landmark : Receipt;
          return (
            <li key={item.id} className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{item.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {formatDateShort(item.dueDate)} ·{" "}
                  <span className={cn(soon && "text-warning")}>
                    {days <= 0 ? "due today" : `in ${days}d`}
                  </span>
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {formatCurrency(item.amount, currency)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
