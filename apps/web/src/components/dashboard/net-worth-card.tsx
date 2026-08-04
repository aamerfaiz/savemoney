"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompact, formatCurrency, type CurrencyCode } from "@savemoney/finance-engine/format";

interface Point {
  month: string;
  value: number;
}

export function NetWorthCard({
  data,
  netWorth,
  changePct,
  currency,
}: {
  data: Point[];
  netWorth: number;
  changePct: number;
  currency: CurrencyCode;
}) {
  const up = changePct >= 0;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Net Worth
          </span>
          <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {formatCurrency(netWorth, currency)}
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: up ? "#22c55e22" : "#f43f5e22",
            color: up ? "#22c55e" : "#f43f5e",
          }}
        >
          {up ? "▲" : "▼"} {Math.abs(changePct * 100).toFixed(1)}%
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={120}>
          <AreaChart data={data} margin={{ top: 5, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8400ff" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#8400ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <YAxis hide domain={["dataMin - 4000", "dataMax + 2000"]} />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--foreground)",
              }}
              labelStyle={{ color: "var(--muted-foreground)" }}
              formatter={(value) => [
                formatCompact(Number(value), currency),
                "Net worth",
              ]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#8400ff"
              strokeWidth={2}
              fill="url(#nw)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
