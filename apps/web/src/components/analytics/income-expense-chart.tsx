"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompact, formatCurrency, type CurrencyCode } from "@savemoney/finance-engine/format";
import type { MonthPoint } from "@/lib/analytics/types";

export function IncomeExpenseChart({
  months,
  currency,
}: {
  months: MonthPoint[];
  currency: CurrencyCode;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={240}>
      <BarChart data={months} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => formatCompact(Number(v), currency)}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            fontSize: 12,
          }}
          formatter={(value, name) => [
            formatCurrency(Number(value), currency),
            name === "income" ? "Income" : "Expenses",
          ]}
        />
        <Legend
          iconType="circle"
          formatter={(v) => (
            <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
              {v === "income" ? "Income" : "Expenses"}
            </span>
          )}
        />
        <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="expenses" fill="#8400ff" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
