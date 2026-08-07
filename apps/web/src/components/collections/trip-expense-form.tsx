"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@savemoney/finance-engine/format";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { encryptedAddTripExpense } from "@/lib/collections/client-actions";
import type { CollectionAction } from "./collection-detail-view";
import type { CollectionWithProgress } from "@/lib/collections/types";
import type { CategoryOption, AccountOption } from "@/lib/transactions/reference";

const todayISO = () => new Date().toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

interface PayerRow {
  contributorId: string;
  amount: string;
}

interface SplitRow {
  contributorId: string;
  checked: boolean;
  amount: string;
}

/**
 * Trip-type sibling of `ExpenseForm` — no single "paid by" dropdown, since a
 * trip expense can have several payers, and no category-only split; the
 * split-between list drives the balance math (see
 * `@savemoney/finance-engine/collections`'s `computeTripBalances`). Owns its
 * own mutation the same way ExpenseForm does, for the same optimistic-update
 * reasoning — reuses the "addExpense" reducer action since
 * `CollectionExpenseRow` already carries `payers`/`splits`.
 */
export function TripExpenseForm({
  collection,
  expenseCategories,
  accounts,
  dek,
  dispatch,
  startTransition,
  onSuccess,
}: {
  collection: CollectionWithProgress;
  expenseCategories: CategoryOption[];
  accounts: AccountOption[];
  dek: CryptoKey;
  dispatch: (action: CollectionAction) => void;
  startTransition: (callback: () => void | Promise<void>) => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const contributors = collection.contributors.filter((c) => !c.isLegacy);
  const nameById = new Map(collection.contributors.map((c) => [c.id, c.displayName]));

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [spentAt, setSpentAt] = useState(todayISO());
  const [linkToTransaction, setLinkToTransaction] = useState(false);
  const [accountId, setAccountId] = useState("");

  const [payers, setPayers] = useState<PayerRow[]>([
    { contributorId: contributors[0]?.id ?? "", amount: "" },
  ]);
  const [splitEqually, setSplitEqually] = useState(true);
  const [splits, setSplits] = useState<SplitRow[]>(
    contributors.map((c) => ({ contributorId: c.id, checked: true, amount: "" })),
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAmount = Number(amount) || 0;
  const payersTotal =
    payers.length === 1 ? totalAmount : round2(payers.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const payersDiff = round2(totalAmount - payersTotal);

  const checkedSplits = splits.filter((s) => s.checked);
  const splitsTotal = splitEqually
    ? totalAmount
    : round2(checkedSplits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0));
  const splitsDiff = round2(totalAmount - splitsTotal);
  const equalShare = checkedSplits.length > 0 ? totalAmount / checkedSplits.length : 0;

  function updatePayer(i: number, patch: Partial<PayerRow>) {
    setPayers((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addPayerRow() {
    const used = new Set(payers.map((p) => p.contributorId));
    const next = contributors.find((c) => !used.has(c.id));
    setPayers((rows) => [...rows, { contributorId: next?.id ?? "", amount: "" }]);
  }
  function removePayerRow(i: number) {
    setPayers((rows) => rows.filter((_, idx) => idx !== i));
  }

  function toggleSplit(contributorId: string) {
    setSplits((rows) =>
      rows.map((r) => (r.contributorId === contributorId ? { ...r, checked: !r.checked } : r)),
    );
  }
  function updateSplitAmount(contributorId: string, value: string) {
    setSplits((rows) =>
      rows.map((r) => (r.contributorId === contributorId ? { ...r, amount: value } : r)),
    );
  }

  /** Divides to the cent; any remainder from an uneven split goes to the
   * first N people (by list order) so the parts sum to exactly `amount`. */
  function buildEqualSplitAmounts(): Map<string, number> {
    const ids = checkedSplits.map((s) => s.contributorId);
    const cents = Math.round(totalAmount * 100);
    const base = Math.floor(cents / ids.length);
    const remainder = cents - base * ids.length;
    const map = new Map<string, number>();
    ids.forEach((id, idx) => map.set(id, (base + (idx < remainder ? 1 : 0)) / 100));
    return map;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (payers.some((p) => !p.contributorId)) {
      setError("Pick who paid.");
      return;
    }
    if (payers.length > 1 && Math.abs(payersDiff) > 0.01) {
      setError(
        `Payer amounts don't add up to the total — ${payersDiff > 0 ? "short" : "over"} by ${formatCurrency(Math.abs(payersDiff), collection.currency)}.`,
      );
      return;
    }
    if (checkedSplits.length === 0) {
      setError("Split with at least one person.");
      return;
    }
    if (!splitEqually && Math.abs(splitsDiff) > 0.01) {
      setError(
        `Split amounts don't add up to the total — ${splitsDiff > 0 ? "short" : "over"} by ${formatCurrency(Math.abs(splitsDiff), collection.currency)}.`,
      );
      return;
    }

    const resolvedPayers =
      payers.length === 1
        ? [{ contributorId: payers[0].contributorId, amount: totalAmount }]
        : payers.map((p) => ({ contributorId: p.contributorId, amount: round2(Number(p.amount) || 0) }));

    const equalMap = splitEqually ? buildEqualSplitAmounts() : null;
    const resolvedSplits = checkedSplits.map((s) => ({
      contributorId: s.contributorId,
      amount: splitEqually ? (equalMap!.get(s.contributorId) ?? 0) : round2(Number(s.amount) || 0),
    }));

    const category = categoryId ? expenseCategories.find((c) => c.id === categoryId) : undefined;
    const trimmedDescription = description.trim() || null;

    setPending(true);
    startTransition(async () => {
      dispatch({
        type: "addExpense",
        expense: {
          id: `optimistic-${crypto.randomUUID()}`,
          amount: totalAmount,
          description: trimmedDescription,
          categoryId: categoryId || null,
          categoryName: category?.name ?? null,
          categoryIcon: category?.icon ?? null,
          paidByContributorId: null,
          paidByName: null,
          payers: resolvedPayers.map((p) => ({
            ...p,
            contributorName: nameById.get(p.contributorId) ?? "Unknown",
          })),
          splits: resolvedSplits.map((s) => ({
            ...s,
            contributorName: nameById.get(s.contributorId) ?? "Unknown",
          })),
          spentAt,
          linkedTransactionId: null,
        },
      });
      onSuccess();

      const result = await encryptedAddTripExpense(dek, collection.id, {
        amount: totalAmount,
        description: trimmedDescription,
        categoryId: categoryId || null,
        spentAt,
        payers: resolvedPayers,
        splits: resolvedSplits,
        linkToTransaction,
        accountId: accountId || null,
      });
      if (!result.ok) setError(result.error ?? "Couldn't add expense.");
      invalidateFinanceData();
      router.refresh();
      setPending(false);
    });
  }

  if (contributors.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
        Add contributors to this trip before logging an expense.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="spentAt">Date</Label>
          <Input
            id="spentAt"
            type="date"
            value={spentAt}
            onChange={(e) => setSpentAt(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">What was it for?</Label>
        <Input
          id="description"
          placeholder="e.g. Hotel"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="categoryId">Category</Label>
        <Select id="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Uncategorized</option>
          {expenseCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex items-center justify-between">
          <Label>Paid by</Label>
          {payers.length < contributors.length && (
            <button
              type="button"
              onClick={addPayerRow}
              className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <Plus className="size-3" /> Add payer
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {payers.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Select
                value={p.contributorId}
                onChange={(e) => updatePayer(i, { contributorId: e.target.value })}
                className="flex-1"
              >
                <option value="">Who paid?</option>
                {contributors
                  .filter((c) => c.id === p.contributorId || !payers.some((r) => r.contributorId === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
              </Select>
              {payers.length > 1 && (
                <>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={p.amount}
                    onChange={(e) => updatePayer(i, { amount: e.target.value })}
                    className="w-24"
                  />
                  <button
                    type="button"
                    onClick={() => removePayerRow(i)}
                    aria-label="Remove payer"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-negative/15 hover:text-negative"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        {payers.length > 1 && (
          <p className={cn("text-xs", Math.abs(payersDiff) > 0.01 ? "text-negative" : "text-muted-foreground")}>
            {Math.abs(payersDiff) <= 0.01
              ? "Adds up."
              : `${payersDiff > 0 ? "Short by" : "Over by"} ${formatCurrency(Math.abs(payersDiff), collection.currency)}`}
          </p>
        )}
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex items-center justify-between">
          <Label>Split between</Label>
          <div className="flex overflow-hidden rounded-md border border-border text-xs">
            <button
              type="button"
              onClick={() => setSplitEqually(true)}
              className={cn("px-2 py-1", splitEqually ? "bg-brand text-brand-foreground" : "hover:bg-muted")}
            >
              Equally
            </button>
            <button
              type="button"
              onClick={() => setSplitEqually(false)}
              className={cn("px-2 py-1", !splitEqually ? "bg-brand text-brand-foreground" : "hover:bg-muted")}
            >
              Custom
            </button>
          </div>
        </div>
        <div className="space-y-1">
          {splits.map((s) => (
            <div key={s.contributorId} className="flex items-center gap-2">
              <label className="flex flex-1 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={s.checked}
                  onChange={() => toggleSplit(s.contributorId)}
                  className="size-3.5 accent-[var(--color-brand)]"
                />
                {nameById.get(s.contributorId) ?? "Unknown"}
              </label>
              {s.checked &&
                (splitEqually ? (
                  <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(equalShare, collection.currency)}
                  </span>
                ) : (
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={s.amount}
                    onChange={(e) => updateSplitAmount(s.contributorId, e.target.value)}
                    className="w-24"
                  />
                ))}
            </div>
          ))}
        </div>
        {!splitEqually && (
          <p className={cn("text-xs", Math.abs(splitsDiff) > 0.01 ? "text-negative" : "text-muted-foreground")}>
            {Math.abs(splitsDiff) <= 0.01
              ? "Adds up."
              : `${splitsDiff > 0 ? "Short by" : "Over by"} ${formatCurrency(Math.abs(splitsDiff), collection.currency)}`}
          </p>
        )}
      </div>

      <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
        <span>
          <span className="block text-sm font-medium">Log as an expense</span>
          <span className="block text-xs text-muted-foreground">
            Adds your share to your own Transactions.
          </span>
        </span>
        <input
          type="checkbox"
          checked={linkToTransaction}
          onChange={(e) => setLinkToTransaction(e.target.checked)}
          className="size-4 accent-[var(--color-brand)]"
        />
      </label>

      {linkToTransaction && accounts.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="accountId">Account</Label>
          <Select id="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {error && <p className="text-sm text-negative">{error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Adding…" : "Add expense"}
      </Button>
    </form>
  );
}

