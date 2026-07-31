"use client";

import { BudgetsView } from "./budgets-view";
import { VaultGate } from "@/components/finance/vault-gate";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import type { CurrencyCode } from "@/lib/format";
import type { CategoryOption } from "@/lib/transactions/reference";

export function AuthedBudgetsView({
  categories,
  currency,
}: {
  categories: CategoryOption[];
  currency: CurrencyCode;
}) {
  const query = useFinanceData(currency);
  return (
    <VaultGate query={query}>
      {(data) => <BudgetsView data={data.budgets} categories={categories} />}
    </VaultGate>
  );
}
