import Link from "next/link";

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { ScoreData } from "@/lib/score/compute";
import type { HealthResult } from "@savemoney/finance-engine/health-score";
import {
  SIGNALS,
  signalStatus,
  BAND_VERDICT,
} from "@/lib/score/signals";

const BAND_LABEL: Record<HealthResult["band"], string> = {
  critical: "Critical",
  poor: "Needs work",
  fair: "Fair",
  good: "Good",
  excellent: "Excellent",
};

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 65) return "#84cc16";
  if (score >= 45) return "#f59e0b";
  if (score >= 25) return "#f97316";
  return "#f43f5e";
}

const STATUS_TONE = {
  strong: "text-positive",
  fair: "text-warning",
  weak: "text-negative",
} as const;

export function FinancialScoreView({ data }: { data: ScoreData }) {
  const { health, currency } = data;
  const color = scoreColor(health.score);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
          Financial Score
        </h1>
        <p className="text-sm text-muted-foreground">
          One number for your overall financial health, from seven weighted
          signals.
        </p>
      </div>

      {/* Hero */}
      <div className="flex flex-col items-center gap-5 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-center">
        <ScoreRing score={health.score} color={color} />
        <div className="space-y-2 text-center sm:text-left">
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {BAND_LABEL[health.band]}
          </span>
          <p className="text-sm text-muted-foreground">
            {BAND_VERDICT[health.band]}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(data.netSaved, currency, {
              compact: true,
              showSign: true,
            })}{" "}
            net over the last 6 months ·{" "}
            <span className="tabular-nums">
              {formatPercent(data.savingsRate, 0)}
            </span>{" "}
            savings rate
          </p>
        </div>
      </div>

      {/* Signal breakdown */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium">Signal breakdown</h2>
        {SIGNALS.map((s) => {
          const value = health.breakdown[s.key];
          const status = signalStatus(value);
          return (
            <div
              key={s.key}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon name={s.icon} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {s.label}
                    </span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                      {formatPercent(s.weight, 0)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.description}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    STATUS_TONE[status],
                  )}
                >
                  {value}
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.max(2, value)}%`,
                    backgroundColor: scoreColor(value),
                  }}
                />
              </div>

              {status !== "strong" && (
                <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="text-brand">→</span>
                  <span>
                    {s.tip}{" "}
                    <Link
                      href={s.href}
                      className="font-medium text-brand hover:underline"
                    >
                      Open
                    </Link>
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Emergency fund and budget discipline currently use neutral baselines and
        will sharpen as those data sources are wired in. The score is computed by
        the same pure engine used across the app.
      </p>
    </div>
  );
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;
  return (
    <div className="relative size-40 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="9"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums">{score}</span>
        <span className="text-xs text-muted-foreground">out of 100</span>
      </div>
    </div>
  );
}
