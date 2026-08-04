"use client";

import { VaultGate } from "@/components/finance/vault-gate";
import { FinancialScoreView } from "./financial-score-view";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { computeScoreData } from "@/lib/score/compute";
import type { CurrencyCode } from "@savemoney/finance-engine/format";

export function AuthedScore({ currency }: { currency: CurrencyCode }) {
  const query = useFinanceData(currency);
  return (
    <VaultGate query={query} module="your financial score">
      {(data) => <FinancialScoreView data={computeScoreData(data.analytics)} />}
    </VaultGate>
  );
}
