import { TrendingUp, TrendingDown, Wallet, Percent } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { HealthGauge } from "@/components/dashboard/health-gauge";
import { SpendingDonut } from "@/components/dashboard/spending-donut";
import { IncomeExpenseChart } from "./income-expense-chart";
import { SavingsRateChart } from "./savings-rate-chart";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { AnalyticsData } from "@/lib/analytics/types";

export function AnalyticsView({
  data,
  readOnly,
}: {
  data: AnalyticsData;
  readOnly: boolean;
}) {
  const { months, totals, byCategory, health, currency, monthsCount } = data;
  const maxCategory = byCategory[0]?.amount ?? 1;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground">Last {monthsCount} months</p>
      </div>

      {readOnly && (
        <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Demo mode — sign in with Supabase configured to see your own analytics.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <StatTile
            label="Income"
            value={formatCurrency(totals.income, currency, { compact: true })}
            icon={TrendingUp}
            tone="positive"
          />
        </Card>
        <Card className="p-4">
          <StatTile
            label="Expenses"
            value={formatCurrency(totals.expenses, currency, { compact: true })}
            icon={TrendingDown}
          />
        </Card>
        <Card className="p-4">
          <StatTile
            label="Net saved"
            value={formatCurrency(totals.net, currency, { compact: true })}
            icon={Wallet}
            tone={totals.net >= 0 ? "positive" : "negative"}
          />
        </Card>
        <Card className="p-4">
          <StatTile
            label="Savings rate"
            value={formatPercent(totals.savingsRate)}
            icon={Percent}
            tone={totals.savingsRate >= 0.2 ? "positive" : "neutral"}
          />
        </Card>
      </div>

      {/* Income vs Expenses */}
      <Card>
        <CardHeader>
          <CardTitle>Income vs Expenses</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <IncomeExpenseChart months={months} currency={currency} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Savings rate trend */}
        <Card>
          <CardHeader>
            <CardTitle>Savings rate trend</CardTitle>
          </CardHeader>
          <CardContent className="h-60">
            <SavingsRateChart months={months} />
          </CardContent>
        </Card>

        {/* Expense breakdown (SpendingDonut carries its own title) */}
        <Card>
          <CardContent className="pt-5">
            {byCategory.length > 0 ? (
              <SpendingDonut data={byCategory} currency={currency} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No expenses in range.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top spending categories */}
        <Card>
          <CardHeader>
            <CardTitle>Top spending categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {byCategory.slice(0, 6).map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.category}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCurrency(c.amount, currency)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(c.amount / maxCategory) * 100}%`,
                      backgroundColor: c.color,
                    }}
                  />
                </div>
              </div>
            ))}
            {byCategory.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing to show yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Financial health (HealthGauge carries its own title) */}
        <Card>
          <CardContent className="pt-5">
            <HealthGauge health={health} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
