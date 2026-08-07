"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, HandCoins, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@savemoney/finance-engine/format";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { deleteSettlement } from "@/lib/collections/actions";
import { encryptedAddSettlement } from "@/lib/collections/client-actions";
import type { CollectionAction } from "./collection-detail-view";
import type { CollectionWithProgress } from "@/lib/collections/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * `trip`-type only — the Splitwise "who owes whom" view. Per-contributor net
 * position, a minimal set of suggested payments to zero everyone out
 * (`simplifySettlements`, finance-engine), and a form to record a real
 * payment (which reduces both people's net the same way — see
 * `computeTripBalances`). No pool bars here; this entirely replaces them for
 * a trip collection.
 */
export function BalancesPanel({
  collection,
  dek,
  dispatch,
  startTransition,
}: {
  collection: CollectionWithProgress;
  dek: CryptoKey;
  dispatch: (action: CollectionAction) => void;
  startTransition: (callback: () => void | Promise<void>) => void;
}) {
  const [recording, setRecording] = useState<{ from: string; to: string; amount: string } | null>(null);

  const nameById = new Map(collection.contributors.map((c) => [c.id, c.displayName]));
  const balances = [...collection.balances]
    .filter((b) => nameById.has(b.contributorId))
    .sort((a, b) => b.net - a.net);
  const allSettled = balances.every((b) => Math.abs(b.net) < 0.01);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {balances.map((b) => (
          <div
            key={b.contributorId}
            className="flex items-center justify-between rounded-md border border-border bg-card p-3 text-sm"
          >
            <span className="font-medium">{nameById.get(b.contributorId)}</span>
            {Math.abs(b.net) < 0.01 ? (
              <span className="text-xs text-muted-foreground">Settled up</span>
            ) : (
              <span className={cn("tabular-nums text-sm font-medium", b.net > 0 ? "text-positive" : "text-negative")}>
                {b.net > 0
                  ? `gets back ${formatCurrency(b.net, collection.currency)}`
                  : `owes ${formatCurrency(-b.net, collection.currency)}`}
              </span>
            )}
          </div>
        ))}
        {balances.length === 0 && (
          <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
            No expenses logged yet.
          </p>
        )}
      </div>

      {!allSettled && collection.suggestedSettlements.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Suggested settle-up</p>
          {collection.suggestedSettlements.map((s, i) => (
            <div
              key={`${s.fromContributorId}-${s.toContributorId}-${i}`}
              className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border p-2.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                {s.fromName} <ArrowRight className="size-3 shrink-0 text-muted-foreground" /> {s.toName}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums font-medium">{formatCurrency(s.amount, collection.currency)}</span>
                {collection.status === "open" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 gap-1 px-2"
                    onClick={() =>
                      setRecording({
                        from: s.fromContributorId,
                        to: s.toContributorId,
                        amount: String(s.amount),
                      })
                    }
                  >
                    <Check className="size-3" /> Settle
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {recording ? (
        <SettlementForm
          collection={collection}
          initial={recording}
          dek={dek}
          dispatch={dispatch}
          startTransition={startTransition}
          onDone={() => setRecording(null)}
        />
      ) : (
        collection.status === "open" && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setRecording({ from: "", to: "", amount: "" })}
          >
            <Plus className="size-3.5" /> Record a settlement
          </Button>
        )
      )}

      {collection.settlements.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Settled</p>
          {collection.settlements.map((s) => (
            <SettlementRow key={s.id} collection={collection} settlement={s} dispatch={dispatch} startTransition={startTransition} />
          ))}
        </div>
      )}
    </div>
  );
}

function SettlementRow({
  collection,
  settlement: s,
  dispatch,
  startTransition,
}: {
  collection: CollectionWithProgress;
  settlement: CollectionWithProgress["settlements"][number];
  dispatch: (action: CollectionAction) => void;
  startTransition: (callback: () => void | Promise<void>) => void;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();

  function onRemove() {
    if (!confirm(`Remove this ${formatCurrency(s.amount, collection.currency)} settlement?`)) return;
    startTransition(async () => {
      dispatch({ type: "removeSettlement", settlementId: s.id });
      await deleteSettlement(collection.id, s.id);
      invalidateFinanceData();
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <HandCoins className="size-3.5 shrink-0" />
        <span className="truncate">
          {s.fromName} <ArrowRight className="mx-0.5 inline size-3" /> {s.toName} · {s.settledAt}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="tabular-nums font-medium">{formatCurrency(s.amount, collection.currency)}</span>
        {collection.status === "open" && !s.id.startsWith("optimistic-") && (
          <button
            onClick={onRemove}
            aria-label="Remove settlement"
            className="rounded-md p-1 text-muted-foreground hover:bg-negative/15 hover:text-negative"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function SettlementForm({
  collection,
  initial,
  dek,
  dispatch,
  startTransition,
  onDone,
}: {
  collection: CollectionWithProgress;
  initial: { from: string; to: string; amount: string };
  dek: CryptoKey;
  dispatch: (action: CollectionAction) => void;
  startTransition: (callback: () => void | Promise<void>) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [fromContributorId, setFromContributorId] = useState(initial.from);
  const [toContributorId, setToContributorId] = useState(initial.to);
  const [amount, setAmount] = useState(initial.amount);
  const [settledAt, setSettledAt] = useState(todayISO());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameById = new Map(collection.contributors.map((c) => [c.id, c.displayName]));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amt = Number(amount);
    if (!fromContributorId || !toContributorId) {
      setError("Pick two people.");
      return;
    }
    if (fromContributorId === toContributorId) {
      setError("Pick two different people.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    setPending(true);

    startTransition(async () => {
      dispatch({
        type: "addSettlement",
        settlement: {
          id: `optimistic-${crypto.randomUUID()}`,
          fromContributorId,
          fromName: nameById.get(fromContributorId) ?? "Unknown",
          toContributorId,
          toName: nameById.get(toContributorId) ?? "Unknown",
          amount: amt,
          settledAt,
          note: null,
        },
      });
      onDone();

      const result = await encryptedAddSettlement(dek, collection.id, {
        fromContributorId,
        toContributorId,
        amount: amt,
        settledAt,
        note: null,
      });
      if (!result.ok) setError(result.error ?? "Couldn't record settlement.");
      invalidateFinanceData();
      router.refresh();
      setPending(false);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 rounded-md border border-border p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="fromContributorId">Who paid</Label>
          <Select
            id="fromContributorId"
            value={fromContributorId}
            onChange={(e) => setFromContributorId(e.target.value)}
          >
            <option value="">Pick…</option>
            {collection.contributors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="toContributorId">Who received</Label>
          <Select id="toContributorId" value={toContributorId} onChange={(e) => setToContributorId(e.target.value)}>
            <option value="">Pick…</option>
            {collection.contributors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="settlementAmount">Amount</Label>
          <Input
            id="settlementAmount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="settledAt">Date</Label>
          <Input id="settledAt" type="date" value={settledAt} onChange={(e) => setSettledAt(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-xs text-negative">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          {pending ? "Saving…" : "Record"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
