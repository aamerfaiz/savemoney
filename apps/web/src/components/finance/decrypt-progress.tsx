"use client";

import { Lock } from "lucide-react";

/**
 * Replaces the page skeleton for the one moment that actually needs
 * explaining: the client-side E2EE decrypt pass (Phase 3.5.10). Two
 * states, matching the two real phases in useFinanceData/useSideData —
 * `indeterminate` while raw ciphertext is still in flight (no row count to
 * weight progress by yet), then a determinate ring once decrypt starts.
 * Ring markup mirrors dashboard/health-gauge.tsx (SVG `stroke`/`fill`
 * attrs with `var(--...)`, not Tailwind stroke-* classes — no other
 * component in the app uses those). Sized for a 390px viewport first; the
 * ring doesn't grow on desktop since the win there is line length, not
 * icon size.
 */
export function DecryptProgress({
  percent,
  indeterminate = false,
}: {
  percent: number;
  indeterminate?: boolean;
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, percent));
  // Indeterminate: a fixed quarter-circle arc that spins, standard
  // CSS-spinner shape — there's no real fraction to show yet.
  const dash = indeterminate ? circumference * 0.25 : (pct / 100) * circumference;

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="relative size-20 shrink-0">
        <svg
          viewBox="0 0 80 80"
          className={`size-full -rotate-90 ${indeterminate ? "animate-spin" : ""}`}
          aria-hidden
        >
          <circle cx="40" cy="40" r={radius} fill="none" stroke="var(--border)" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: indeterminate ? undefined : "stroke-dasharray 0.3s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {indeterminate ? (
            <Lock className="size-5 text-muted-foreground" />
          ) : (
            <span className="text-sm font-semibold tabular-nums">{pct}%</span>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium" aria-live="polite">
          {indeterminate ? "Loading your data…" : "Decrypting your data…"}
        </p>
        <p className="mx-auto max-w-[22rem] text-xs text-muted-foreground">
          Happening on your device — nothing leaves unencrypted.
        </p>
      </div>
    </div>
  );
}
