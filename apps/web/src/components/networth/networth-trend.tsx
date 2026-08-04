"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompact, type CurrencyCode } from "@/lib/format";
import type { TrendPoint } from "@savemoney/finance-engine/net-worth";

/** Net-worth area chart — shared visual language with the dashboard card. */
export function NetWorthTrend({
  data,
  currency,
}: {
  data: TrendPoint[];
  currency: CurrencyCode;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={180}>
      <AreaChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
        <defs>
          <linearGradient id="nw-page" x1="0" y1="0" x2="0" y2="1">
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
        <YAxis
          hide
          domain={["dataMin - 4000", "dataMax + 2000"]}
        />
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
          formatter={(value) => [formatCompact(Number(value), currency), "Net worth"]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#8400ff"
          strokeWidth={2}
          fill="url(#nw-page)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
