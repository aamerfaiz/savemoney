"use client";

import { BudgetsView } from "./budgets-view";
import { VaultGate } from "@/components/finance/vault-gate";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { CategoryOption } from "@/lib/transactions/reference";

export function AuthedBudgetsView({
  categories,
  currency,
}: {
  categories: CategoryOption[];
  currency: CurrencyCode;
}) {
  const dek = useVaultStore((s) => s.dek);
  const query = useFinanceData(currency);
  return (
    <VaultGate query={query} module="your budgets">
      {(data) =>
        dek && (
          <BudgetsView
            data={data.budgets}
            categories={categories}
            dek={dek}
            failedCount={data.failedBudgetCount}
          />
        )
      }
    </VaultGate>
  );
}
