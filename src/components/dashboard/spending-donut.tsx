"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatCurrency, type CurrencyCode } from "@/lib/format";

interface Slice {
  category: string;
  amount: number;
  color: string;
}

export function SpendingDonut({
  data,
  currency,
}: {
  data: Slice[];
  currency: CurrencyCode;
}) {
  const total = data.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="flex h-full flex-col gap-3">
      <span className="text-xs font-medium text-muted-foreground">
        Spending breakdown
      </span>
      <div className="flex flex-1 items-center gap-4">
        <div className="relative size-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="amount"
                nameKey="category"
                innerRadius={44}
                outerRadius={62}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((d) => (
                  <Cell key={d.category} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(value, name) => [
                  formatCurrency(Number(value), currency),
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] text-muted-foreground">Total</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(total, currency, { compact: true })}
            </span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
          {data.slice(0, 5).map((d) => (
            <li key={d.category} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="flex-1 truncate text-muted-foreground">
                {d.category}
              </span>
              <span className="tabular-nums">
                {Math.round((d.amount / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
