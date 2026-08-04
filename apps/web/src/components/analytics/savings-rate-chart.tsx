"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPercent } from "@/lib/format";
import type { MonthPoint } from "@/lib/analytics/types";

export function SavingsRateChart({ months }: { months: MonthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
      <AreaChart data={months} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="sr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
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
          width={40}
          domain={[0, 1]}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => formatPercent(Number(v))}
        />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            fontSize: 12,
          }}
          formatter={(value) => [formatPercent(Number(value), 1), "Savings rate"]}
        />
        <Area
          type="monotone"
          dataKey="savingsRate"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#sr)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
