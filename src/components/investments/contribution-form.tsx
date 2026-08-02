"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import type { ActionResult } from "@/lib/investments/actions";
import { encryptedRecordContribution } from "@/lib/investments/client-actions";
import { formatCurrency } from "@/lib/format";
import type { InvestmentWithProjection } from "@/lib/investments/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function ContributionForm({
  investment,
  onSuccess,
  dek,
}: {
  investment: InvestmentWithProjection;
  onSuccess: () => void;
  dek: CryptoKey;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [addToValue, setAddToValue] = useState(true);
  const action = encryptedRecordContribution.bind(null, dek, investment);
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
        {formatCurrency(investment.currentValue, investment.currency)} current
        value · {formatCurrency(investment.investedAmount, investment.currency)}{" "}
        invested
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
            defaultValue={investment.monthlyContribution ?? ""}
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

      <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
        <span className="text-sm">
          <span className="font-medium">Add to current value</span>
          <span className="block text-xs text-muted-foreground">
            A fresh buy hasn&apos;t gained or lost yet — grows both cost and
            value
          </span>
        </span>
        <input
          type="checkbox"
          name="addToValue"
          checked={addToValue}
          onChange={(e) => setAddToValue(e.target.checked)}
          className="size-4 accent-[var(--color-brand)]"
        />
      </label>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Recording…" : "Add contribution"}
      </Button>
    </form>
  );
}
