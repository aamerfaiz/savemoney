"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/goals/actions";
import { encryptedAddContribution } from "@/lib/goals/client-actions";
import { formatCurrency } from "@/lib/format";
import type { GoalWithProgress } from "@/lib/goals/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function ContributionForm({
  goal,
  onSuccess,
  dek,
}: {
  goal: GoalWithProgress;
  onSuccess: () => void;
  dek: CryptoKey;
}) {
  const router = useRouter();
  const action = encryptedAddContribution.bind(null, dek, goal);
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(action, undefined);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onSuccess();
    }
  }, [state, onSuccess, router]);

  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {formatCurrency(goal.currentAmount, goal.currency)} of{" "}
        {formatCurrency(goal.targetAmount, goal.currency)} saved ·{" "}
        {formatCurrency(goal.projection.remaining, goal.currency)} to go
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            aria-invalid={!!err.amount}
            required
            autoFocus
          />
          {err.amount && <p className="text-xs text-negative">{err.amount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contributedAt">Date</Label>
          <Input
            id="contributedAt"
            name="contributedAt"
            type="date"
            defaultValue={todayISO()}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" name="note" placeholder="e.g. Bonus" maxLength={200} />
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Adding…" : "Add contribution"}
      </Button>
    </form>
  );
}
