"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordPayment, type ActionResult } from "@/lib/loans/actions";
import { formatCurrency } from "@/lib/format";
import type { LoanWithProjection } from "@/lib/loans/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function PaymentForm({
  loan,
  onSuccess,
}: {
  loan: LoanWithProjection;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [isExtra, setIsExtra] = useState(false);
  const action = recordPayment.bind(null, loan.id);
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
        {formatCurrency(loan.remainingAmount, loan.currency)} outstanding at{" "}
        {loan.interestRate}% · EMI {formatCurrency(loan.emi, loan.currency)}
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
            defaultValue={loan.emi}
            aria-invalid={!!err.amount}
            required
            autoFocus
          />
          {err.amount && <p className="text-xs text-negative">{err.amount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paidOn">Date</Label>
          <Input id="paidOn" name="paidOn" type="date" defaultValue={todayISO()} />
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
        <span className="text-sm">
          <span className="font-medium">Extra payment</span>
          <span className="block text-xs text-muted-foreground">
            Applies the full amount to principal
          </span>
        </span>
        <input
          type="checkbox"
          name="isExtra"
          checked={isExtra}
          onChange={(e) => setIsExtra(e.target.checked)}
          className="size-4 accent-[var(--color-brand)]"
        />
      </label>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Recording…" : "Record payment"}
      </Button>
    </form>
  );
}
