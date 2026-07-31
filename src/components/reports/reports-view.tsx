"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Printer, TrendingUp, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { ReportsData } from "@/lib/reports/compute";

type Scope = 1 | 3 | 6;

const SCOPES: { value: Scope; label: string }[] = [
  { value: 1, label: "This month" },
  { value: 3, label: "3 months" },
  { value: 6, label: "6 months" },
];

const BAND_LABEL: Record<string, string> = {
  critical: "Critical",
  poor: "Needs work",
  fair: "Fair",
  good: "Good",
  excellent: "Excellent",
};

export function ReportsView({ data }: { data: ReportsData }) {
  const { currency } = data;
  const [scope, setScope] = useState<Scope>(6);

  const scopeMonths = useMemo(
    () => data.months.slice(-scope),
    [data.months, scope],
  );

  const summary = useMemo(() => {
    const income = scopeMonths.reduce((s, m) => s + m.income, 0);
    const expenses = scopeMonths.reduce((s, m) => s + m.expenses, 0);
    const contributed = scopeMonths.reduce((s, m) => s + m.contributed, 0);
    const net = income - expenses;
    const savingsRate = income > 0 ? Math.max(net, contributed) / income : 0;
    return { income, expenses, net, savingsRate };
  }, [scopeMonths]);

  const categoryTotal = useMemo(
    () => data.byCategory.reduce((s, c) => s + c.amount, 0),
    [data.byCategory],
  );

  const rangeLabel =
    scopeMonths.length > 1
      ? `${scopeMonths[0].label} – ${scopeMonths[scopeMonths.length - 1].label}`
      : (scopeMonths[0]?.label ?? "");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            {rangeLabel} · generated {data.generatedAt}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5 print:hidden"
          onClick={() => window.print()}
        >
          <Printer className="size-4" /> Print
        </Button>
      </div>

      {/* Period selector */}
      <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-1 print:hidden">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            onClick={() => setScope(s.value)}
            className={cn(
              "rounded-[7px] py-2 text-sm font-medium transition-colors",
              scope === s.value
                ? "bg-brand/20 text-brand"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          label="Income"
          value={formatCurrency(summary.income, currency, { compact: true })}
          tone="positive"
        />
        <SummaryTile
          label="Expenses"
          value={formatCurrency(summary.expenses, currency, { compact: true })}
          tone="negative"
        />
        <SummaryTile
          label="Net saved"
          value={formatCurrency(summary.net, currency, {
            compact: true,
            showSign: true,
          })}
          tone={summary.net >= 0 ? "positive" : "negative"}
        />
        <SummaryTile
          label="Savings rate"
          value={formatPercent(summary.savingsRate, 0)}
        />
      </div>

      {/* Monthly breakdown */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Monthly breakdown</h2>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-4 gap-2 border-b border-border px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Month</span>
            <span className="text-right">Income</span>
            <span className="text-right">Expenses</span>
            <span className="text-right">Net</span>
          </div>
          {scopeMonths.map((m) => (
            <div
              key={m.key}
              className="grid grid-cols-4 gap-2 border-b border-border px-4 py-2.5 text-sm last:border-0"
            >
              <span className="font-medium">{m.label}</span>
              <span className="text-right tabular-nums text-positive">
                {formatCurrency(m.income, currency, { compact: true })}
              </span>
              <span className="text-right tabular-nums text-negative">
                {formatCurrency(m.expenses, currency, { compact: true })}
              </span>
              <span
                className={cn(
                  "text-right tabular-nums",
                  m.net >= 0 ? "text-foreground" : "text-negative",
                )}
              >
                {formatCurrency(m.net, currency, {
                  compact: true,
                  showSign: true,
                })}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Spending by category */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Spending by category</h2>
          <span className="text-xs text-muted-foreground">
            Last {data.monthsCount} months
          </span>
        </div>
        <div className="space-y-2.5 rounded-lg border border-border bg-card p-4">
          {data.byCategory.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No spending recorded yet.
            </p>
          ) : (
            data.byCategory.slice(0, 8).map((c) => {
              const share = categoryTotal > 0 ? c.amount / categoryTotal : 0;
              return (
                <div key={c.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{c.category}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatCurrency(c.amount, currency, { compact: true })}
                      <span className="ml-1.5 text-xs">
                        {formatPercent(share, 0)}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, share * 100)}%`,
                        backgroundColor: c.color,
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Net worth + score */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Net worth</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(data.netWorth, currency)}
          </div>
          <div
            className={cn(
              "mt-1 flex items-center gap-1 text-xs font-medium tabular-nums",
              data.netWorthChangePct >= 0 ? "text-positive" : "text-negative",
            )}
          >
            {data.netWorthChangePct >= 0 ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            {formatPercent(data.netWorthChangePct, 1)} over {data.monthsCount}mo
          </div>
        </div>
        <Link
          href="/financial-score"
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <div className="text-xs text-muted-foreground">Financial score</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {data.health.score}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / 100
            </span>
          </div>
          <div className="mt-1 text-xs font-medium text-brand">
            {BAND_LABEL[data.health.band]} · view breakdown →
          </div>
        </Link>
      </section>
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
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-base font-semibold tabular-nums lg:text-lg",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </div>
    </div>
  );
}
