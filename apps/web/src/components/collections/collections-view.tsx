"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Trash2, Users, ShieldAlert, HandCoins, Plane } from "lucide-react";

import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CollectionForm } from "./collection-form";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@savemoney/finance-engine/format";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { useAutoOpenAdd } from "@/lib/nav/use-auto-open-add";
import { deleteCollection } from "@/lib/collections/actions";
import type { CollectionsData } from "@/lib/collections/compute";
import type { CollectionWithProgress } from "@/lib/collections/types";

export function CollectionsView({
  data,
  dek,
  failedCount = 0,
}: {
  data: CollectionsData;
  dek: CryptoKey;
  /** Rows that existed but couldn't be decrypted with the current DEK. */
  failedCount?: number;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(useAutoOpenAdd());
  const [editing, setEditing] = useState<CollectionWithProgress | null>(null);

  const [collections, removeCollection] = useOptimistic(
    data.collections,
    (state: CollectionWithProgress[], id: string) => state.filter((c) => c.id !== id),
  );

  const open = collections.filter((c) => c.status === "open");
  const closed = collections.filter((c) => c.status === "closed");

  const onDelete = (c: CollectionWithProgress) => {
    if (!confirm(`Delete "${c.title}"? This removes all of its contributors, contributions, and expenses too.`)) return;
    startTransition(async () => {
      removeCollection(c.id);
      await deleteCollection(c.id);
      invalidateFinanceData();
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Collections</h1>
          <p className="text-sm text-muted-foreground">
            Track who chipped in — gift money, group buys, office pools.
          </p>
        </div>
        <Button className="hidden gap-1.5 sm:inline-flex" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> New collection
        </Button>
      </div>

      {failedCount > 0 && (
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-3 text-xs text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          {failedCount} {failedCount === 1 ? "row" : "rows"} couldn&apos;t be read — saved
          before encryption was enabled and can&apos;t be recovered.
        </p>
      )}

      {collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
          <HandCoins className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No collections yet.</p>
          <Button variant="secondary" onClick={() => setAdding(true)} className="gap-1.5">
            <Plus className="size-4" /> Start your first
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {open.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {open.map((c) => (
                <CollectionCard key={c.id} c={c} onEdit={() => setEditing(c)} onDelete={() => onDelete(c)} />
              ))}
            </div>
          )}

          {closed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Closed</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {closed.map((c) => (
                  <CollectionCard key={c.id} c={c} onEdit={() => setEditing(c)} onDelete={() => onDelete(c)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setAdding(true)}
        aria-label="New collection"
        className="fixed bottom-24 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_8px_30px_-6px_var(--color-brand)] transition-transform active:scale-95 sm:hidden"
      >
        <Plus className="size-6" />
      </button>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="New collection"
        description="Start pooling contributions toward something."
      >
        <CollectionForm onSuccess={() => setAdding(false)} dek={dek} />
      </Dialog>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Edit collection">
        {editing && (
          <CollectionForm existing={editing} onSuccess={() => setEditing(null)} dek={dek} />
        )}
      </Dialog>
    </div>
  );
}

function CollectionCard({
  c,
  onEdit,
  onDelete,
}: {
  c: CollectionWithProgress;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { summary } = c;
  const pct = summary.progress != null ? Math.round(summary.progress * 100) : null;
  const peopleCount = c.type === "trip" ? c.contributors.length : summary.contributorCount;
  const allSettled = c.balances.every((b) => Math.abs(b.net) < 0.01);

  return (
    <div className="group flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md",
            c.status === "closed" ? "bg-muted text-muted-foreground" : "bg-brand/15 text-brand",
          )}
        >
          <Icon name={c.icon ?? "gift"} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/collections/${c.id}`} className="truncate text-left text-sm font-medium hover:underline">
            {c.title}
          </Link>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            {c.type === "trip" ? <Plane className="size-3" /> : <Users className="size-3" />}
            {peopleCount} {peopleCount === 1 ? "person" : "people"}
            {c.status === "closed" && (
              <Badge variant="default" className="ml-1.5">
                Closed
              </Badge>
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
          <button
            onClick={onEdit}
            aria-label="Edit"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-negative/15 hover:text-negative"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <Link href={`/collections/${c.id}`} className="mt-3 block">
        {c.type === "trip" ? (
          <>
            <span className="font-semibold tabular-nums">
              {formatCurrency(summary.totalSpent, c.currency)}
            </span>
            <span className="ml-1 text-xs text-muted-foreground">spent</span>
            {c.expenses.length > 0 && (
              <p className={cn("mt-1.5 text-xs", allSettled ? "text-positive" : "text-muted-foreground")}>
                {allSettled ? "Everyone's settled up" : "Balances outstanding"}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold tabular-nums">
                {formatCurrency(summary.totalCollected, c.currency)}
              </span>
              {c.targetAmount != null && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  of {formatCurrency(c.targetAmount, c.currency)}
                </span>
              )}
            </div>
            {pct != null && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    summary.isFullyFunded ? "bg-positive" : "bg-brand",
                  )}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            )}
            {summary.totalSpent > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                {formatCurrency(summary.totalSpent, c.currency)} spent ·{" "}
                <span className={summary.isOverspent ? "text-negative" : ""}>
                  {formatCurrency(summary.balance, c.currency)} left
                </span>
              </p>
            )}
          </>
        )}
      </Link>
    </div>
  );
}
