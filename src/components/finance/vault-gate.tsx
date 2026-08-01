"use client";

import { PageHeaderSkeleton, StatTilesSkeleton } from "@/components/skeletons";
import { VaultLockedPrompt } from "./vault-locked-prompt";
import { useVaultStore } from "@/lib/vault/store";
import type { UseQueryResult } from "@tanstack/react-query";

/**
 * Shared locked/loading/error boilerplate for every page that now needs
 * decrypted finance data (Phase 3.5.3) — wraps a `useFinanceData()` result
 * and only renders `children` once the vault is unlocked and data is ready.
 */
export function VaultGate<T>({
  query,
  children,
  module = "this page",
}: {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
  module?: string;
}) {
  const dek = useVaultStore((s) => s.dek);

  if (!dek) {
    return <VaultLockedPrompt module={module} />;
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeaderSkeleton />
        <StatTilesSkeleton count={3} />
      </div>
    );
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
