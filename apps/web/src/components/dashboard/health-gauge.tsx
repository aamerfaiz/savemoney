import type { HealthResult } from "@savemoney/finance-engine/health-score";
import { cn } from "@/lib/utils";

const BAND_LABEL: Record<HealthResult["band"], string> = {
  critical: "Critical",
  poor: "Needs work",
  fair: "Fair",
  good: "Good",
  excellent: "Excellent",
};

/** Circular gauge for the 0–100 Financial Health Score. */
export function HealthGauge({ health }: { health: HealthResult }) {
  const { score, band } = health;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  const color =
    score >= 80
      ? "#22c55e"
      : score >= 65
        ? "#84cc16"
        : score >= 45
          ? "#f59e0b"
          : score >= 25
            ? "#f97316"
            : "#f43f5e";

  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">
        Financial Health
      </span>
      <div className="flex items-center gap-4">
        <div className="relative size-32 shrink-0">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90">
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="var(--border)"
              strokeWidth="10"
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold tabular-nums">{score}</span>
            <span className="text-[10px] text-muted-foreground">/ 100</span>
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <span
            className={cn(
              "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
            )}
            style={{ backgroundColor: `${color}22`, color }}
          >
            {BAND_LABEL[band]}
          </span>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex justify-between gap-4">
              <span>Savings</span>
              <span className="tabular-nums">{health.breakdown.savingsRate}</span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Emergency fund</span>
              <span className="tabular-nums">
                {health.breakdown.emergencyFund}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Debt ratio</span>
              <span className="tabular-nums">{health.breakdown.debtRatio}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
