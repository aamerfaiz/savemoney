"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserPlus } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContributionForm } from "./contribution-form";
import { formatCurrency } from "@savemoney/finance-engine/format";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { deleteParticipant, deleteContribution } from "@/lib/collections/actions";
import {
  encryptedCreateParticipant,
  encryptedMigrateLegacyContributions,
} from "@/lib/collections/client-actions";
import type { CollectionAction } from "./collection-detail-view";
import type { CollectionContributionRow, CollectionWithProgress } from "@/lib/collections/types";

export function ParticipantsPanel({
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
  const [loggingFor, setLoggingFor] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const legacyGroups = useMemo(() => {
    const map = new Map<string, CollectionContributionRow[]>();
    for (const c of collection.contributions) {
      if (!c.isLegacy) continue;
      const list = map.get(c.contributorName) ?? [];
      list.push(c);
      map.set(c.contributorName, list);
    }
    return [...map.entries()].map(([name, rows]) => ({
      name,
      rows,
      total: rows.reduce((s, r) => s + r.amount, 0),
    }));
  }, [collection.contributions]);

  function handleAddParticipant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const displayName = String(fd.get("displayName") ?? "").trim();
    if (!displayName) return;
    setAddError(null);
    setAddPending(true);
    form.reset();

    startTransition(async () => {
      const result = await encryptedCreateParticipant(dek, collection.id, undefined, fd);
      if (!result.ok || !result.id) {
        setAddError(result.error ?? "Couldn't add participant.");
      } else {
        dispatch({
          type: "addParticipant",
          participant: { id: result.id, displayName, linkedUserId: null, totalContributed: 0 },
        });
      }
      invalidateFinanceData();
      router.refresh();
      setAddPending(false);
    });
  }

  function onRemoveParticipant(id: string, name: string) {
    if (!confirm(`Remove ${name} from this collection?`)) return;
    startTransition(async () => {
      const result = await deleteParticipant(collection.id, id);
      if (!result.ok) {
        setRowError((s) => ({ ...s, [id]: result.error ?? "Couldn't remove." }));
        return;
      }
      dispatch({ type: "removeParticipant", participantId: id });
      invalidateFinanceData();
      router.refresh();
    });
  }

  function onRemoveLegacyGroup(name: string, rows: CollectionContributionRow[]) {
    if (!confirm(`Remove all ${rows.length} contribution${rows.length === 1 ? "" : "s"} from "${name}"?`)) return;
    startTransition(async () => {
      for (const r of rows) {
        dispatch({ type: "removeContribution", contributionId: r.id });
      }
      await Promise.all(rows.map((r) => deleteContribution(collection.id, r.id)));
      invalidateFinanceData();
      router.refresh();
    });
  }

  function onMigrateLegacy(name: string, rows: CollectionContributionRow[]) {
    startTransition(async () => {
      const result = await encryptedMigrateLegacyContributions(
        dek,
        collection.id,
        name,
        rows.map((r) => r.id),
      );
      if (!result.ok || !result.id) return;
      dispatch({
        type: "migrateLegacy",
        participant: { id: result.id, displayName: name, linkedUserId: null, totalContributed: 0 },
        contributionIds: rows.map((r) => r.id),
      });
      invalidateFinanceData();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Participants" description="Who's in this collection, and what they've put in.">
      <div className="space-y-4">
        <form onSubmit={handleAddParticipant} className="flex gap-2">
          <Input name="displayName" placeholder="Add a person…" maxLength={80} required className="flex-1" />
          <Button type="submit" size="sm" disabled={addPending} className="gap-1">
            <UserPlus className="size-4" /> Add
          </Button>
        </form>
        {addError && <p className="text-xs text-negative">{addError}</p>}

        {collection.participants.length === 0 ? (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            No one added yet.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {collection.participants.map((p) => {
              const isPending = p.id.startsWith("optimistic-");
              return (
                <li key={p.id} className="rounded-md border border-border p-2.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{p.displayName}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">
                        {formatCurrency(p.totalContributed, collection.currency)}
                      </span>
                      {collection.status === "open" && !isPending && (
                        <>
                          <button
                            onClick={() => setLoggingFor(loggingFor === p.id ? null : p.id)}
                            aria-label={`Log a contribution for ${p.displayName}`}
                            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Plus className="size-3.5" />
                          </button>
                          <button
                            onClick={() => onRemoveParticipant(p.id, p.displayName)}
                            aria-label={`Remove ${p.displayName}`}
                            className="rounded-md p-1 text-muted-foreground hover:bg-negative/15 hover:text-negative"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {rowError[p.id] && <p className="mt-1 text-xs text-negative">{rowError[p.id]}</p>}
                  {loggingFor === p.id && (
                    <div className="mt-2">
                      <ContributionForm
                        collectionId={collection.id}
                        participant={p}
                        dek={dek}
                        dispatch={dispatch}
                        startTransition={startTransition}
                        onSuccess={() => setLoggingFor(null)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {legacyGroups.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              From before the roster — add these to keep tracking them
            </p>
            <ul className="space-y-1.5">
              {legacyGroups.map((g) => (
                <li key={g.name} className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border p-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.rows.length} {g.rows.length === 1 ? "entry" : "entries"} ·{" "}
                      {formatCurrency(g.total, collection.currency)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => onMigrateLegacy(g.name, g.rows)}>
                      Add to roster
                    </Button>
                    <button
                      onClick={() => onRemoveLegacyGroup(g.name, g.rows)}
                      aria-label={`Remove all of ${g.name}'s contributions`}
                      className="rounded-md p-1 text-muted-foreground hover:bg-negative/15 hover:text-negative"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
