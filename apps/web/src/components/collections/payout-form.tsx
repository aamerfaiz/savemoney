"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import type { ActionResult } from "@/lib/collections/actions";
import { encryptedRecordPayout } from "@/lib/collections/client-actions";
import { formatCurrency } from "@savemoney/finance-engine/format";
import type { CollectionWithProgress } from "@/lib/collections/types";
import type { CategoryOption, AccountOption } from "@/lib/transactions/reference";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function PayoutForm({
  collection,
  expenseCategories,
  accounts,
  onSuccess,
  dek,
}: {
  collection: CollectionWithProgress;
  expenseCategories: CategoryOption[];
  accounts: AccountOption[];
  onSuccess: () => void;
  dek: CryptoKey;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const action = encryptedRecordPayout.bind(null, dek, collection.id);
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(action, undefined);

  useEffect(() => {
    if (state?.ok) {
      invalidateFinanceData();
      router.refresh();
      onSuccess();
    }
  }, [state, onSuccess, router, invalidateFinanceData]);

  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {formatCurrency(collection.summary.totalCollected, collection.currency)} collected from{" "}
        {collection.summary.contributorCount}{" "}
        {collection.summary.contributorCount === 1 ? "person" : "people"}. Recording a payout
        closes this collection.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount spent</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            defaultValue={collection.summary.totalCollected || ""}
            aria-invalid={!!err.amount}
            required
            autoFocus
          />
          {err.amount && <p className="text-xs text-negative">{err.amount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payoutAt">Date</Label>
          <Input id="payoutAt" name="payoutAt" type="date" defaultValue={todayISO()} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">What was it spent on?</Label>
        <Input id="note" name="note" placeholder="e.g. Gift card + card" maxLength={200} />
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
          name="createExpense"
          value="true"
          defaultChecked
          className="size-4 accent-[var(--color-brand)]"
        />
      </label>

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
        {accounts.length > 0 && (
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
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Recording…" : "Record payout & close"}
      </Button>
    </form>
  );
}
