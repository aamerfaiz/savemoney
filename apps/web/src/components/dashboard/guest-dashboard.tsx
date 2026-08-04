"use client";

import { useEffect, useState } from "react";

import { CardSkeleton, StatTilesSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardView } from "./dashboard-view";
import { computeGuestDashboard } from "@/lib/guest/dashboard";
import type { DashboardData } from "@/data/mock-dashboard";

/** Guest-mode dashboard: same markup as the real page, computed client-side
 *  from IndexedDB (no Supabase involved at all). */
export function GuestDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;
    computeGuestDashboard().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <StatTilesSkeleton count={4} className="grid-cols-2 lg:grid-cols-4" />
        <div className="grid gap-4 lg:grid-cols-2">
          <CardSkeleton className="h-56" />
          <CardSkeleton className="h-56" />
        </div>
      </div>
    );
  }

  return <DashboardView d={data} />;
}
