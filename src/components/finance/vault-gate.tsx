"use client";

import { DecryptProgress } from "./decrypt-progress";
import { VaultLockedPrompt } from "./vault-locked-prompt";
import { useDecryptProgress } from "@/lib/finance/decrypt-progress";
import { useDelayedLoading } from "@/lib/finance/use-delayed-loading";
import { useVaultStore } from "@/lib/vault/store";
import type { UseQueryResult } from "@tanstack/react-query";

/**
 * Shared locked/loading/error boilerplate for every page that now needs
 * decrypted finance data (Phase 3.5.3) — wraps a `useFinanceData()` result
 * and only renders `children` once the vault is unlocked and data is ready.
 * `progressKeys` defaults to `["finance-data"]`, the only chunk every
 * current caller (Budgets/Score/Analytics) awaits — pass the actual set of
 * `useFinanceData`/`useSideData` query keys a page reads if it ever
 * combines more than one.
 */
export function VaultGate<T>({
  query,
  children,
  module = "this page",
  progressKeys = ["finance-data"],
}: {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
  module?: string;
  progressKeys?: string[];
}) {
  const dek = useVaultStore((s) => s.dek);
  const showLoading = useDelayedLoading(query.isLoading);
  const progress = useDecryptProgress(progressKeys);

  if (!dek) {
    return <VaultLockedPrompt module={module} />;
  }

  if (showLoading) {
    return <DecryptProgress percent={progress.percent} indeterminate={!progress.known} />;
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-negative">
          {query.error instanceof Error
            ? query.error.message
            : "Couldn't load your data."}
        </p>
      </div>
    );
  }

  return <>{children(query.data)}</>;
}
