"use client";

import { AnalyticsView } from "./analytics-view";
import { VaultGate } from "@/components/finance/vault-gate";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import type { CurrencyCode } from "@savemoney/finance-engine/format";

export function AuthedAnalyticsView({ currency }: { currency: CurrencyCode }) {
  const query = useFinanceData(currency);
  return (
    <VaultGate query={query} module="your analytics">{(data) => <AnalyticsView data={data.analytics} />}</VaultGate>
  );
}
