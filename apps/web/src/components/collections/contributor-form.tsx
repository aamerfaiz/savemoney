"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import type { ActionResult } from "@/lib/collections/actions";
import { encryptedAddContributor } from "@/lib/collections/client-actions";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function ContributorForm({
  collectionId,
  onSuccess,
  dek,
}: {
  collectionId: string;
  onSuccess: () => void;
  dek: CryptoKey;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const action = encryptedAddContributor.bind(null, dek, collectionId);
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
    <form action={formAction} className="space-y-3 rounded-md border border-border p-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <Label htmlFor="contributorName">Who?</Label>
          <Input
            id="contributorName"
            name="contributorName"
            placeholder="e.g. Alice"
            aria-invalid={!!err.contributorName}
            required
          />
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
            aria-invalid={!!err.amount}
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

      {state?.error && !state.fieldErrors && (
        <p className="text-xs text-negative">{state.error}</p>
      )}

      <Button type="submit" size="sm" className="w-full" disabled={pending}>
        {pending ? "Adding…" : "Add contributor"}
      </Button>
    </form>
  );
}
