"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateShort, daysUntil } from "@savemoney/finance-engine/format";
import type { BillCalendarData } from "@/lib/calendar/queries";
import type { BillOccurrence } from "@/lib/calendar/types";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function BillCalendarView({ data }: { data: BillCalendarData }) {
  const { occurrences, monthStart, currency } = data;
  const monthDate = new Date(monthStart + "T00:00:00");
  const todayISO = new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState<string>(todayISO);

  // Group occurrences by ISO date for quick lookup.
  const byDate = useMemo(() => {
    const map = new Map<string, BillOccurrence[]>();
    for (const o of occurrences) {
      const list = map.get(o.dueDate) ?? [];
      list.push(o);
      map.set(o.dueDate, list);
    }
    return map;
  }, [occurrences]);

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = monthDate.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  const selectedItems = byDate.get(selected) ?? [];

  // Upcoming list: everything from today forward, capped.
  const upcoming = useMemo(
    () => occurrences.filter((o) => o.dueDate >= todayISO).slice(0, 12),
    [occurrences, todayISO],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
          Bill calendar
        </h1>
        <p className="text-sm text-muted-foreground">
          Upcoming bills &amp; loan EMIs
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SummaryTile
          label="Due this month"
          value={formatCurrency(data.monthOutflow, currency, { compact: true })}
        />
        <SummaryTile
          label="Next 30 days"
          value={formatCurrency(data.next30Outflow, currency, { compact: true })}
          tone="warning"
        />
      </div>

      {/* Month grid */}
      <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
        <div className="mb-3 text-sm font-medium">{monthLabel}</div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const items = byDate.get(date);
            const hasOutflow = items?.some((o) => o.kind !== "income");
            const hasIncome = items?.some((o) => o.kind === "income");
            const isToday = date === todayISO;
            const isSelected = date === selected;
            const day = Number(date.slice(8, 10));
            return (
              <button
                key={i}
                onClick={() => setSelected(date)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                  isSelected
                    ? "bg-brand text-brand-foreground"
                    : "hover:bg-muted",
                  isToday && !isSelected && "ring-1 ring-brand",
                )}
              >
                <span className={cn(!isSelected && "text-foreground")}>
                  {day}
                </span>
                <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                  {hasOutflow && (
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        isSelected ? "bg-brand-foreground" : "bg-brand",
                      )}
                    />
                  )}
                  {hasIncome && (
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        isSelected ? "bg-brand-foreground/70" : "bg-positive",
                      )}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      <div>
        <div className="mb-2 text-sm font-medium">
          {formatDateShort(selected)}
          {selected === todayISO && (
            <span className="ml-2 text-xs text-muted-foreground">Today</span>
          )}
        </div>
        {selectedItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing due on this day.
          </p>
        ) : (
          <div className="space-y-2">
            {selectedItems.map((o) => (
              <OccurrenceRow key={o.id} o={o} />
            ))}
          </div>
        )}
      </div>

      {/* Upcoming list */}
      {upcoming.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium">Upcoming</div>
          <div className="space-y-2">
            {upcoming.map((o) => (
              <OccurrenceRow key={o.id} o={o} showDate />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-base font-semibold tabular-nums lg:text-lg",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function OccurrenceRow({
  o,
  showDate,
}: {
  o: BillOccurrence;
  showDate?: boolean;
}) {
  const income = o.kind === "income";
  const days = daysUntil(o.dueDate);
  const soon = days >= 0 && days <= 3;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md bg-muted",
          income ? "text-positive" : o.kind === "emi" ? "text-warning" : "text-brand",
        )}
      >
        <Icon name={o.icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{o.title}</div>
        <div className="text-[11px] text-muted-foreground">
          {showDate && (
            <>
              {formatDateShort(o.dueDate)}
              {" · "}
            </>
          )}
          {o.kind === "emi" ? "Loan EMI" : income ? "Income" : "Bill"}
          {showDate && days >= 0 && (
            <span className={cn("ml-1", soon && "text-warning")}>
              {days === 0 ? "· due today" : `· in ${days}d`}
            </span>
          )}
        </div>
      </div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums",
          income ? "text-positive" : "text-foreground",
        )}
      >
        {income ? "+" : ""}
        {formatCurrency(o.amount, o.currency)}
      </div>
    </div>
  );
}
