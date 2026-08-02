"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import type { ActionResult } from "@/lib/budgets/actions";
import {
  encryptedCreateBudget,
  encryptedUpdateBudget,
} from "@/lib/budgets/client-actions";
import { BUDGET_PERIODS, type BudgetWithProgress } from "@/lib/budgets/types";
import type { CategoryOption } from "@/lib/transactions/reference";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function BudgetForm({
  categories,
  existing,
  onSuccess,
  dek,
}: {
  categories: CategoryOption[];
  existing?: BudgetWithProgress;
  onSuccess: () => void;
  dek: CryptoKey;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const action = existing
    ? encryptedUpdateBudget.bind(null, dek, existing.id)
    : encryptedCreateBudget.bind(null, dek);
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

  const fieldErr = state?.fieldErrors ?? {};
  const expenseCategories = categories.filter((c) => c.kind === "expense");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="startsOn" value={todayISO()} />

      <div className="space-y-1.5">
        <Label htmlFor="categoryId">Category</Label>
        <Select
          id="categoryId"
          name="categoryId"
          defaultValue={existing?.categoryId ?? ""}
        >
          <option value="">Overall (all spending)</option>
          {expenseCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Budget amount</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            defaultValue={existing?.amount ?? ""}
            aria-invalid={!!fieldErr.amount}
            required
          />
          {fieldErr.amount && <p className="text-xs text-negative">{fieldErr.amount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="period">Period</Label>
          <Select
            id="period"
            name="period"
            defaultValue={existing?.period ?? "monthly"}
          >
            {BUDGET_PERIODS.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : existing ? "Save changes" : "Create budget"}
      </Button>
    </form>
  );
}
