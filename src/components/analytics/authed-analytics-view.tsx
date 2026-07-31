"use client";

import { AnalyticsView } from "./analytics-view";
import { VaultGate } from "@/components/finance/vault-gate";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import type { CurrencyCode } from "@/lib/format";

export function AuthedAnalyticsView({ currency }: { currency: CurrencyCode }) {
  const query = useFinanceData(currency);
  return (
    <VaultGate query={query}>{(data) => <AnalyticsView data={data.analytics} />}</VaultGate>
  );
}
