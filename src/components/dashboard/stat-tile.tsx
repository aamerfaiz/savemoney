import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Compact KPI tile: label, big value, optional delta. Lives inside a BentoCard. */
export function StatTile({
  label,
  value,
  icon: Icon,
  deltaPct,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  deltaPct?: number;
  hint?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div>
        <div
          className={cn(
            "text-2xl font-semibold tracking-tight tabular-nums",
            tone === "positive" && "text-positive",
            tone === "negative" && "text-negative",
          )}
        >
          {value}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs">
          {deltaPct !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                up ? "text-positive" : "text-negative",
              )}
            >
              {up ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {Math.abs(deltaPct * 100).toFixed(1)}%
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      </div>
    </div>
  );
}
