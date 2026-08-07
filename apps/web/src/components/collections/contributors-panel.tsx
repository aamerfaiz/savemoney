"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Link2, Pencil, Plus, Trash2, UserPlus } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ContributionForm } from "./contribution-form";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@savemoney/finance-engine/format";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { deleteContributor, deleteContribution } from "@/lib/collections/actions";
import {
  encryptedCreateContributor,
  encryptedLinkLegacyContributions,
} from "@/lib/collections/client-actions";
import type { CollectionAction } from "./collection-detail-view";
import type {
  CollectionContributionRow,
  CollectionContributor,
  CollectionWithProgress,
} from "@/lib/collections/types";

/**
 * One unified contributor list — real roster rows and pre-roster ("legacy")
 * name groupings render side by side with the same shape, not as two
 * separate sections. A legacy entry gets a "Link" action instead of
 * add-money/remove; everything else (view/edit/delete individual
 * contributions) works the same either way.
 */
export function ContributorsPanel({
  collection,
  open,
  onClose,
  dek,
  dispatch,
  startTransition,
}: {
  collection: CollectionWithProgress;
  open: boolean;
  onClose: () => void;
  dek: CryptoKey;
  dispatch: (action: CollectionAction) => void;
  startTransition: (callback: () => void | Promise<void>) => void;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [addError, setAddError] = useState<string | null>(null);
  const [addPending, setAddPending] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [editingContribution, setEditingContribution] = useState<CollectionContributionRow | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  function handleAddContributor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const displayName = String(fd.get("displayName") ?? "").trim();
    if (!displayName) return;
    setAddError(null);
    setAddPending(true);
    form.reset();

    startTransition(async () => {
      const result = await encryptedCreateContributor(dek, collection.id, undefined, fd);
      if (!result.ok || !result.id) {
        setAddError(result.error ?? "Couldn't add contributor.");
      } else {
        dispatch({
          type: "addContributor",
          contributor: { id: result.id, displayName, linkedUserId: null, totalContributed: 0, isLegacy: false },
        });
      }
      invalidateFinanceData();
      router.refresh();
      setAddPending(false);
    });
  }

  function onRemoveContributor(id: string, name: string) {
    if (!confirm(`Remove ${name} from this collection?`)) return;
    startTransition(async () => {
      const result = await deleteContributor(collection.id, id);
      if (!result.ok) {
        setRowError((s) => ({ ...s, [id]: result.error ?? "Couldn't remove." }));
        return;
      }
      dispatch({ type: "removeContributor", contributorId: id });
      invalidateFinanceData();
      router.refresh();
    });
  }

  function onRemoveContribution(c: CollectionContributionRow) {
    if (!confirm(`Remove this ${formatCurrency(c.amount, collection.currency)} contribution?`)) return;
    startTransition(async () => {
      dispatch({ type: "removeContribution", contributionId: c.id });
      await deleteContribution(collection.id, c.id);
      invalidateFinanceData();
      router.refresh();
    });
  }

  function onLink(contributor: CollectionContributor) {
    const rows = collection.contributions.filter((c) => c.contributorId === contributor.id);
    startTransition(async () => {
      const result = await encryptedLinkLegacyContributions(
        dek,
        collection.id,
        contributor.displayName,
        rows.map((r) => r.id),
      );
      if (!result.ok || !result.id) return;
      dispatch({
        type: "linkLegacy",
        contributor: {
          id: result.id,
          displayName: contributor.displayName,
          linkedUserId: null,
          totalContributed: contributor.totalContributed,
          isLegacy: false,
        },
        contributionIds: rows.map((r) => r.id),
      });
      invalidateFinanceData();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Contributors"
      description={
        collection.type === "trip"
          ? "Who's on this trip."
          : "Who's in this collection, and what they've put in."
      }
    >
      <div className="space-y-4">
        <form onSubmit={handleAddContributor} className="flex gap-2">
          <Input name="displayName" placeholder="Add a person…" maxLength={80} required className="flex-1" />
          <Button type="submit" size="sm" disabled={addPending} className="gap-1">
            <UserPlus className="size-4" /> Add
          </Button>
        </form>
        {addError && <p className="text-xs text-negative">{addError}</p>}

        {collection.contributors.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            No one added yet.
          </p>
        ) : collection.type === "trip" ? (
          <ul className="max-h-96 space-y-1.5 overflow-y-auto">
            {collection.contributors.map((p) => {
              const isPending = p.id.startsWith("optimistic-");
              const balance = collection.balances.find((b) => b.contributorId === p.id);
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">{p.displayName}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    {balance && Math.abs(balance.net) >= 0.01 ? (
                      <span
                        className={cn(
                          "tabular-nums text-xs font-medium",
                          balance.net > 0 ? "text-positive" : "text-negative",
                        )}
                      >
                        {balance.net > 0 ? "gets back " : "owes "}
                        {formatCurrency(Math.abs(balance.net), collection.currency)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Settled up</span>
                    )}
                    {collection.status === "open" && !isPending && (
                      <button
                        onClick={() => onRemoveContributor(p.id, p.displayName)}
                        aria-label={`Remove ${p.displayName}`}
                        className="rounded-md p-1 text-muted-foreground hover:bg-negative/15 hover:text-negative"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  {rowError[p.id] && <p className="px-2.5 pb-2 text-xs text-negative">{rowError[p.id]}</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="max-h-96 space-y-1.5 overflow-y-auto">
            {collection.contributors.map((p) => {
              const isPending = p.id.startsWith("optimistic-");
              const rows = collection.contributions.filter((c) => c.contributorId === p.id);
              const isExpanded = expandedId === p.id;

              return (
                <li key={p.id} className="rounded-md border border-border">
                  <div className="flex items-center justify-between gap-2 p-2.5 text-sm">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 truncate font-medium">{p.displayName}</span>
                      {p.isLegacy && (
                        <Badge variant="warning" className="shrink-0">
                          Unlinked
                        </Badge>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">
                        {formatCurrency(p.totalContributed, collection.currency)}
                      </span>
                      {collection.status === "open" && !isPending && (
                        p.isLegacy ? (
                          <Button variant="secondary" size="sm" className="h-7 gap-1 px-2" onClick={() => onLink(p)}>
                            <Link2 className="size-3" /> Link
                          </Button>
                        ) : (
                          <>
                            <button
                              onClick={() => setAddingFor(addingFor === p.id ? null : p.id)}
                              aria-label={`Log a contribution for ${p.displayName}`}
                              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Plus className="size-3.5" />
                            </button>
                            <button
                              onClick={() => onRemoveContributor(p.id, p.displayName)}
                              aria-label={`Remove ${p.displayName}`}
                              className="rounded-md p-1 text-muted-foreground hover:bg-negative/15 hover:text-negative"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </div>

                  {rowError[p.id] && <p className="px-2.5 pb-2 text-xs text-negative">{rowError[p.id]}</p>}

                  {addingFor === p.id && (
                    <div className="border-t border-border p-2">
                      <ContributionForm
                        collectionId={collection.id}
                        contributor={p}
                        dek={dek}
                        dispatch={dispatch}
                        startTransition={startTransition}
                        onSuccess={() => setAddingFor(null)}
                      />
                    </div>
                  )}

                  {isExpanded && (
                    <div className="space-y-1 border-t border-border p-2">
                      {rows.length === 0 ? (
                        <p className="px-1 py-1 text-xs text-muted-foreground">No contributions yet.</p>
                      ) : (
                        rows.map((c) =>
                          editingContribution?.id === c.id ? (
                            <ContributionForm
                              key={c.id}
                              collectionId={collection.id}
                              contributor={p}
                              existing={c}
                              dek={dek}
                              dispatch={dispatch}
                              startTransition={startTransition}
                              onSuccess={() => setEditingContribution(null)}
                            />
                          ) : (
                            <div
                              key={c.id}
                              className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-muted/50"
                            >
                              <span className="text-muted-foreground">
                                {c.contributedAt}
                                {c.method ? ` · ${c.method}` : ""}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="tabular-nums font-medium">
                                  {formatCurrency(c.amount, collection.currency)}
                                </span>
                                {collection.status === "open" && !c.id.startsWith("optimistic-") && (
                                  <>
                                    <button
                                      onClick={() => setEditingContribution(c)}
                                      aria-label="Edit contribution"
                                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                      <Pencil className="size-3" />
                                    </button>
                                    <button
                                      onClick={() => onRemoveContribution(c)}
                                      aria-label="Remove contribution"
                                      className="rounded-md p-1 text-muted-foreground hover:bg-negative/15 hover:text-negative"
                                    >
                                      <Trash2 className="size-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ),
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
