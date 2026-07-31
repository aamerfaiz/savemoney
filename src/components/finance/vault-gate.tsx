"use client";

import { ShieldAlert } from "lucide-react";

import { PageHeaderSkeleton, StatTilesSkeleton } from "@/components/skeletons";
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
}: {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
}) {
  const dek = useVaultStore((s) => s.dek);

  if (!dek) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-4 text-sm text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          Unlock your vault in Settings → Vault & Encryption to see this
          page.
        </p>
      </div>
    );
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
