"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const todayISO = () => new Date().toISOString().slice(0, 10);

export interface ContributorFormValues {
  contributorName: string;
  amount: number;
  contributedAt: string;
  method: string | null;
}

/**
 * Purely presentational — `CollectionDetailDialog` owns the actual mutation
 * so it can dispatch an optimistic contributor into its `useOptimistic` list
 * synchronously, before the encrypt+write round trip, the same way its own
 * `onDelete` already does. Deliberately not `useActionState`-bound like
 * every other module's manual form: this one lives inside a dialog that
 * stays open and shows a live list right above it, so it needs the instant
 * update a form-action's own transition can't give a *different*
 * component's `useOptimistic` state without this indirection anyway.
 */
export function ContributorForm({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (values: ContributorFormValues) => void;
  pending: boolean;
  error?: string | null;
}) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const contributorName = String(fd.get("contributorName") ?? "").trim();
    const amount = Number(fd.get("amount"));
    if (!contributorName || !Number.isFinite(amount) || amount <= 0) return;

    onSubmit({
      contributorName,
      amount,
      contributedAt: String(fd.get("contributedAt") || todayISO()),
      method: String(fd.get("method") ?? "").trim() || null,
    });
    form.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border p-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <Label htmlFor="contributorName">Who?</Label>
          <Input id="contributorName" name="contributorName" placeholder="e.g. Alice" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <Label htmlFor="contributedAt">Date</Label>
          <Input id="contributedAt" name="contributedAt" type="date" defaultValue={todayISO()} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="method">Method (optional)</Label>
          <Input id="method" name="method" placeholder="e.g. cash, UPI" maxLength={40} />
        </div>
      </div>

      {error && <p className="text-xs text-negative">{error}</p>}

      <Button type="submit" size="sm" className="w-full" disabled={pending}>
        {pending ? "Adding…" : "Add contributor"}
      </Button>
    </form>
  );
}
