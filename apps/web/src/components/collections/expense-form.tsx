"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { encryptedAddExpense } from "@/lib/collections/client-actions";
import type { CollectionAction } from "./collection-detail-view";
import type { CollectionWithProgress } from "@/lib/collections/types";
import type { CategoryOption, AccountOption } from "@/lib/transactions/reference";

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Owns its own mutation (rather than binding to `useActionState`) so it can
 * dispatch an optimistic expense into the parent's `useOptimistic` state
 * before the encrypt+write round trip resolves — same reasoning as
 * ContributionForm's redesign after the "adding a contributor doesn't
 * update until refresh" fix (see that PR).
 */
export function ExpenseForm({
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkToTransaction, setLinkToTransaction] = useState(false);
  // Legacy (pre-roster) entries have a synthetic "legacy:<name>" id, not a
  // real row to point a foreign key at — only real contributors are valid
  // "paid by" choices.
  const realContributors = collection.contributors.filter((p) => !p.isLegacy);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const amount = Number(fd.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    setPending(true);

    const description = String(fd.get("description") ?? "").trim() || null;
    const categoryId = String(fd.get("categoryId") ?? "") || null;
    const paidByContributorId = String(fd.get("paidByContributorId") ?? "") || null;
    const spentAt = String(fd.get("spentAt") || todayISO());
    const category = categoryId ? expenseCategories.find((c) => c.id === categoryId) : undefined;
    const paidBy = paidByContributorId
      ? collection.contributors.find((p) => p.id === paidByContributorId)
      : undefined;

    startTransition(async () => {
      dispatch({
        type: "addExpense",
        expense: {
          id: `optimistic-${crypto.randomUUID()}`,
          amount,
          description,
          categoryId,
          categoryName: category?.name ?? null,
          categoryIcon: category?.icon ?? null,
          paidByContributorId,
          paidByName: paidBy?.displayName ?? null,
          payers: [],
          splits: [],
          spentAt,
          linkedTransactionId: null,
        },
      });
      onSuccess();

      const result = await encryptedAddExpense(dek, collection.id, undefined, fd);
      if (!result.ok) setError(result.error ?? "Couldn't add expense.");
      invalidateFinanceData();
      router.refresh();
      setPending(false);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input id="amount" name="amount" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" required autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="spentAt">Date</Label>
          <Input id="spentAt" name="spentAt" type="date" defaultValue={todayISO()} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">What was it for?</Label>
        <Input id="description" name="description" placeholder="e.g. Gift card" maxLength={200} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="categoryId">Category</Label>
          <Select id="categoryId" name="categoryId" defaultValue="">
            <option value="">Uncategorized</option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        {realContributors.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="paidByContributorId">Paid by (optional)</Label>
            <Select id="paidByContributorId" name="paidByContributorId" defaultValue="">
              <option value="">Unspecified</option>
              {realContributors.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
        <span>
          <span className="block text-sm font-medium">Log as an expense</span>
          <span className="block text-xs text-muted-foreground">
            Adds this to your own Transactions so it shows in your spending.
          </span>
        </span>
        <input
          type="checkbox"
          name="linkToTransaction"
          value="true"
          checked={linkToTransaction}
          onChange={(e) => setLinkToTransaction(e.target.checked)}
          className="size-4 accent-[var(--color-brand)]"
        />
      </label>

      {linkToTransaction && accounts.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="accountId">Account</Label>
          <Select id="accountId" name="accountId" defaultValue="">
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
