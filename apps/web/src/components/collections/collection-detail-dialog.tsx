"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ContributorForm, type ContributorFormValues } from "./contributor-form";
import { formatCurrency } from "@savemoney/finance-engine/format";
import { computeCollectionSummary } from "@savemoney/finance-engine/collections";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { deleteContributor } from "@/lib/collections/actions";
import { encryptedAddContributor } from "@/lib/collections/client-actions";
import type { CollectionContributor, CollectionWithProgress } from "@/lib/collections/types";

type ContributorAction =
  | { type: "add"; contributor: CollectionContributor }
  | { type: "remove"; id: string };

function contributorsReducer(
  state: CollectionContributor[],
  action: ContributorAction,
): CollectionContributor[] {
  if (action.type === "add") return [action.contributor, ...state];
  return state.filter((c) => c.id !== action.id);
}

export function CollectionDetailDialog({
  collection,
  open,
  onClose,
  dek,
  onContributorAdded,
  onContributorRemoved,
}: {
  collection: CollectionWithProgress | null;
  open: boolean;
  onClose: () => void;
  dek: CryptoKey;
  /** Mirrors this dialog's own local optimistic dispatch into the card grid
   * behind it, so a card's total doesn't lag a refetch behind what the open
   * dialog already shows. */
  onContributorAdded: (collectionId: string, contributor: CollectionContributor) => void;
  onContributorRemoved: (collectionId: string, contributorId: string) => void;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [pending, startTransition] = useTransition();
  const [addError, setAddError] = useState<string | null>(null);
  const [contributors, dispatchContributors] = useOptimistic(
    collection?.contributors ?? [],
    contributorsReducer,
  );

  if (!collection) return null;

  // Recomputed locally from the optimistic list (not `collection.summary`)
  // so the total/progress bar above the list update in lockstep with a
  // just-added row instead of lagging a render behind it.
  const summary = computeCollectionSummary(contributors, collection.targetAmount);

  const onDelete = (c: CollectionContributor) => {
    if (!confirm(`Remove ${c.contributorName}'s contribution?`)) return;
    startTransition(async () => {
      dispatchContributors({ type: "remove", id: c.id });
      onContributorRemoved(collection.id, c.id);
      await deleteContributor(c.id);
      invalidateFinanceData();
      router.refresh();
    });
  };

  const onAdd = (values: ContributorFormValues) => {
    setAddError(null);
    startTransition(async () => {
      const contributor: CollectionContributor = {
        id: `optimistic-${crypto.randomUUID()}`,
        contributorName: values.contributorName,
        amount: values.amount,
        contributedAt: values.contributedAt,
        method: values.method,
        note: null,
      };
      dispatchContributors({ type: "add", contributor });
      onContributorAdded(collection.id, contributor);

      const fd = new FormData();
      fd.set("contributorName", values.contributorName);
      fd.set("amount", String(values.amount));
      fd.set("contributedAt", values.contributedAt);
      if (values.method) fd.set("method", values.method);

      const result = await encryptedAddContributor(dek, collection.id, undefined, fd);
      if (!result.ok) setAddError(result.error ?? "Couldn't add contributor.");
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
              {formatCurrency(summary.totalCollected, collection.currency)}
            </span>
            {collection.targetAmount != null && (
              <span className="text-xs text-muted-foreground tabular-nums">
                of {formatCurrency(collection.targetAmount, collection.currency)}
              </span>
            )}
          </div>
          {summary.progress != null && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500"
                style={{ width: `${Math.min(100, summary.progress * 100)}%` }}
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
                    {collection.status === "open" && !c.id.startsWith("optimistic-") && (
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
          <ContributorForm onSubmit={onAdd} pending={pending} error={addError} />
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
