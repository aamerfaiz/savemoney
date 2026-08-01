"use client";

import { ShieldAlert } from "lucide-react";

import { TransactionsView } from "./transactions-view";
import { RowsSkeleton, StatTilesSkeleton, PageHeaderSkeleton } from "@/components/skeletons";
import { VaultLockedPrompt } from "@/components/finance/vault-locked-prompt";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { summarize } from "@/lib/transactions/compute";
import {
  encryptedCreateTransaction,
  encryptedUpdateTransaction,
} from "@/lib/transactions/client-actions";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@/lib/format";
import type { TransactionFilter } from "@/lib/transactions/types";
import type { AccountOption, CategoryOption } from "@/lib/transactions/reference";

/** The real (non-guest) Transactions page's client boundary: unlocks,
 * fetches + decrypts via the shared finance data hook, then renders the
 * same TransactionsView guest mode uses. See docs/e2ee-path-b-plan.md
 * "Architecture shift." */
export function AuthedTransactionsView({
  categories,
  accounts,
  currency,
  filter,
}: {
  categories: CategoryOption[];
  accounts: AccountOption[];
  currency: CurrencyCode;
  filter: TransactionFilter;
}) {
  const dek = useVaultStore((s) => s.dek);
  const { data, isLoading, isError, error } = useFinanceData(currency);

  if (!dek) {
    return <VaultLockedPrompt module="your transactions" />;
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeaderSkeleton />
        <StatTilesSkeleton count={3} />
        <RowsSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-negative">
          {error instanceof Error ? error.message : "Couldn't load your transactions."}
        </p>
      </div>
    );
  }

  const filtered =
    filter === "all" ? data.transactions : data.transactions.filter((t) => t.kind === filter);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {(data.failedIncomeCount > 0 ||
        data.failedExpenseCount > 0 ||
        data.failedContributionCount > 0) && (
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-3 text-xs text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          {data.failedIncomeCount + data.failedExpenseCount + data.failedContributionCount} entries
          couldn&apos;t be read — they were saved before encryption was
          enabled and can&apos;t be recovered. Re-enter them if you still
          need them.
        </p>
      )}
      <TransactionsView
        transactions={filtered}
        summary={summarize(filtered, currency)}
        categories={categories}
        accounts={accounts}
        filter={filter}
        createAction={encryptedCreateTransaction.bind(null, dek)}
        updateAction={encryptedUpdateTransaction.bind(null, dek)}
      />
    </div>
  );
}
