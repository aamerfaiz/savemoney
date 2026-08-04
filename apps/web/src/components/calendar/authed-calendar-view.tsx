"use client";

import { useQuery } from "@tanstack/react-query";

import { BillCalendarView } from "./bill-calendar-view";
import { DecryptProgress } from "@/components/finance/decrypt-progress";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { fetchBillCalendarAction } from "@/lib/finance/side-data";
import { useSideData } from "@/lib/finance/use-side-data";
import { useDecryptProgress } from "@/lib/finance/decrypt-progress";
import { useDelayedLoading } from "@/lib/finance/use-delayed-loading";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@savemoney/finance-engine/format";

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

  const showLoading = useDelayedLoading(side.isLoading || calendar.isLoading);
  const progress = useDecryptProgress(["finance-side-data"]);

  if (!dek) {
    return <VaultLockedPrompt module="your bill calendar" />;
  }

  if (showLoading) {
    return <DecryptProgress percent={progress.percent} indeterminate={!progress.known} />;
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
