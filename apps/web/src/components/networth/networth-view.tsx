"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon, TrendingUp, TrendingDown } from "lucide-react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { NetWorthTrend } from "./networth-trend";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatPercent,
  formatDateShort,
  type CurrencyCode,
} from "@savemoney/finance-engine/format";
import { encryptedCaptureSnapshot } from "@/lib/networth/client-actions";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import type { NetWorthData } from "@/lib/networth/types";
import type { NetWorthComponent } from "@savemoney/finance-engine/net-worth";

export function NetWorthView({
  data,
  dek,
}: {
  data: NetWorthData;
  dek: CryptoKey;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { result, trend, change, changePct, fromSnapshots, snapshots, currency } =
    data;
  const up = change >= 0;

  const onCapture = () => {
    setError(null);
    startTransition(async () => {
      const res = await encryptedCaptureSnapshot(dek, result);
      if (!res.ok) {
        setError(res.error ?? "Couldn't capture snapshot.");
      } else {
        invalidateFinanceData();
        router.refresh();
      }
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            Net Worth
          </h1>
          <p className="text-sm text-muted-foreground">
            Assets minus liabilities
          </p>
        </div>
        <Button
          variant="secondary"
          className="gap-1.5"
          onClick={onCapture}
          disabled={pending}
        >
          <CameraIcon className="size-4" />
          {pending ? "Capturing…" : "Capture today"}
        </Button>
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      {/* Hero: net worth + trend */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground">
              Total net worth
            </span>
            <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums lg:text-4xl">
              {formatCurrency(result.netWorth, currency)}
            </div>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
              up ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative",
            )}
          >
            {up ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            {formatCurrency(change, currency, { compact: true, showSign: true })} (
            {formatPercent(Math.abs(changePct), 1)})
          </span>
        </div>

        <div className="mt-4 h-44">
          <NetWorthTrend data={trend} currency={currency} />
        </div>
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          {fromSnapshots
            ? "From your captured snapshots"
            : "Estimated from recent cash flow — capture snapshots to track real history"}
        </p>
      </div>

      {/* Assets / liabilities split */}
      <div className="grid gap-3 sm:grid-cols-2">
        <BreakdownCard
          title="Assets"
          total={result.totalAssets}
          components={result.assets}
          currency={currency}
          tone="positive"
        />
        <BreakdownCard
          title="Liabilities"
          total={result.totalLiabilities}
          components={result.liabilities}
          currency={currency}
          tone="negative"
        />
      </div>

      {/* Debt-to-asset ratio */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <div>
          <div className="text-sm font-medium">Debt-to-asset ratio</div>
          <div className="text-xs text-muted-foreground">
            Lower is healthier — how much of your assets is owed
          </div>
        </div>
        <div
          className={cn(
            "text-lg font-semibold tabular-nums",
            result.debtToAssetRatio <= 0.4
              ? "text-positive"
              : result.debtToAssetRatio <= 0.7
                ? "text-warning"
                : "text-negative",
          )}
        >
          {formatPercent(result.debtToAssetRatio, 0)}
        </div>
      </div>

      {/* Snapshot history */}
      {snapshots.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-sm font-medium">Snapshot history</div>
          <div className="divide-y divide-border">
            {snapshots.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {formatDateShort(s.capturedAt)}
                </span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(s.netWorth, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownCard({
  title,
  total,
  components,
  currency,
  tone,
}: {
  title: string;
  total: number;
  components: NetWorthComponent[];
  currency: CurrencyCode;
  tone: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span
          className={cn(
            "text-base font-semibold tabular-nums",
            tone === "positive" ? "text-positive" : "text-negative",
          )}
        >
          {formatCurrency(total, currency)}
        </span>
      </div>

      {components.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Nothing tracked yet.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {components.map((c) => (
            <div key={c.key}>
              <div className="flex items-center gap-2 text-sm">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-brand">
                  <Icon name={c.icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(c.amount, currency)}
                </span>
              </div>
              <div className="mt-1.5 ml-9 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    tone === "positive" ? "bg-positive" : "bg-negative",
                  )}
                  style={{ width: `${Math.round(c.share * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
