"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ContributorForm } from "./contributor-form";
import { formatCurrency } from "@savemoney/finance-engine/format";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { deleteContributor } from "@/lib/collections/actions";
import type { CollectionContributor, CollectionWithProgress } from "@/lib/collections/types";

export function CollectionDetailDialog({
  collection,
  open,
  onClose,
  dek,
}: {
  collection: CollectionWithProgress | null;
  open: boolean;
  onClose: () => void;
  dek: CryptoKey;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [, startTransition] = useTransition();
  const [contributors, removeContributor] = useOptimistic(
    collection?.contributors ?? [],
    (state: CollectionContributor[], id: string) => state.filter((c) => c.id !== id),
  );

  if (!collection) return null;

  const onDelete = (c: CollectionContributor) => {
    if (!confirm(`Remove ${c.contributorName}'s contribution?`)) return;
    startTransition(async () => {
      removeContributor(c.id);
      await deleteContributor(c.id);
      invalidateFinanceData();
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title={collection.title} description={collection.purpose ?? undefined}>
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-semibold tabular-nums">
              {formatCurrency(collection.summary.totalCollected, collection.currency)}
            </span>
            {collection.targetAmount != null && (
              <span className="text-xs text-muted-foreground tabular-nums">
                of {formatCurrency(collection.targetAmount, collection.currency)}
              </span>
            )}
          </div>
          {collection.summary.progress != null && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500"
                style={{ width: `${Math.min(100, collection.summary.progress * 100)}%` }}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {contributors.length} {contributors.length === 1 ? "contributor" : "contributors"}
          </p>
          {contributors.length === 0 ? (
            <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              No contributions yet.
            </p>
          ) : (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto">
              {contributors.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.contributorName}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.contributedAt}
                      {c.method ? ` · ${c.method}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums font-medium">
                      {formatCurrency(c.amount, collection.currency)}
                    </span>
                    {collection.status === "open" && (
                      <button
                        onClick={() => onDelete(c)}
                        aria-label={`Remove ${c.contributorName}`}
                        className="rounded-md p-1 text-muted-foreground hover:bg-negative/15 hover:text-negative"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {collection.status === "open" && (
          <ContributorForm collectionId={collection.id} onSuccess={() => {}} dek={dek} />
        )}

        {collection.status === "closed" && collection.payoutAmount != null && (
          <div className="rounded-md border border-positive/30 bg-positive/5 p-3 text-sm">
            <p className="font-medium text-positive">
              Paid out {formatCurrency(collection.payoutAmount, collection.currency)}
              {collection.payoutAt ? ` on ${collection.payoutAt}` : ""}
            </p>
            {collection.payoutNote && (
              <p className="mt-0.5 text-xs text-muted-foreground">{collection.payoutNote}</p>
            )}
          </div>
        )}

        <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}

