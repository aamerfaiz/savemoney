"use client";

import { ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { BillCalendarView } from "./bill-calendar-view";
import { PageHeaderSkeleton, RowsSkeleton } from "@/components/skeletons";
import { fetchBillCalendarAction } from "@/lib/finance/side-data";
import { useSideData } from "@/lib/finance/use-side-data";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@/lib/format";

/** The real (non-guest) Calendar page's client boundary (Phase 3.5.4) — bill
 * occurrences are built from loan EMIs, which are encrypted now, so this
 * mirrors AuthedGoalsView rather than the old server-component page. */
export function AuthedCalendarView({ currency }: { currency: CurrencyCode }) {
  const dek = useVaultStore((s) => s.dek);
  const side = useSideData(currency);
  const calendar = useQuery({
    queryKey: ["bill-calendar", side.data?.loansData.loans, side.data?.recurringData.rules],
    enabled: !!side.data,
    retry: false,
    queryFn: () =>
      fetchBillCalendarAction(side.data!.loansData.loans, side.data!.recurringData.rules),
  });

  if (!dek) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-4 text-sm text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          Unlock your vault in Settings → Vault & Encryption to see your
          bill calendar.
        </p>
      </div>
    );
  }

  if (side.isLoading || calendar.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeaderSkeleton />
        <RowsSkeleton />
      </div>
    );
  }

  if (side.isError || calendar.isError || !calendar.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-negative">Couldn&apos;t load your bill calendar.</p>
      </div>
    );
  }

  return <BillCalendarView data={calendar.data} />;
}
