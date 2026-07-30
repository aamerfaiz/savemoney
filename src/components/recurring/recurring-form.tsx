"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createRecurringRule,
  updateRecurringRule,
  type ActionResult,
} from "@/lib/recurring/actions";
import {
  RECURRING_FREQUENCIES,
  FREQUENCY_LABEL,
  type RecurringKind,
  type RecurringRuleWithSchedule,
} from "@/lib/recurring/types";
import type {
  AccountOption,
  CategoryOption,
} from "@/lib/transactions/reference";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function RecurringForm({
  categories,
  accounts,
  existing,
  onSuccess,
}: {
  categories: CategoryOption[];
  accounts: AccountOption[];
  existing?: RecurringRuleWithSchedule;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<RecurringKind>(existing?.kind ?? "expense");

  const action = existing
    ? updateRecurringRule.bind(null, existing.id)
    : createRecurringRule;
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

  const fieldErr = state?.fieldErrors ?? {};
  const kindCategories = categories.filter((c) => c.kind === kind);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "rounded-[7px] py-2 text-sm font-medium capitalize transition-colors",
              kind === k
                ? k === "income"
                  ? "bg-positive/20 text-positive"
                  : "bg-brand/20 text-brand"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          placeholder={kind === "income" ? "e.g. Salary" : "e.g. Rent"}
          defaultValue={existing?.name ?? ""}
          aria-invalid={!!fieldErr.name}
          maxLength={80}
          required
        />
        {fieldErr.name && <ErrText>{fieldErr.name}</ErrText>}
      </div>

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
            defaultValue={existing?.amount ?? ""}
            aria-invalid={!!fieldErr.amount}
            required
          />
          {fieldErr.amount && <ErrText>{fieldErr.amount}</ErrText>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="startDate">Starts</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={existing?.startDate ?? todayISO()}
            aria-invalid={!!fieldErr.startDate}
            required
          />
          {fieldErr.startDate && <ErrText>{fieldErr.startDate}</ErrText>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="frequency">Repeats</Label>
          <Select
            id="frequency"
            name="frequency"
            defaultValue={existing?.frequency ?? "monthly"}
          >
            {RECURRING_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="interval">Every</Label>
          <Input
            id="interval"
            name="interval"
            type="number"
            inputMode="numeric"
            min="1"
            max="365"
            defaultValue={existing?.interval ?? 1}
            aria-invalid={!!fieldErr.interval}
          />
          {fieldErr.interval && <ErrText>{fieldErr.interval}</ErrText>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="categoryId">Category</Label>
        <Select
          id="categoryId"
          name="categoryId"
          defaultValue={existing?.categoryId ?? ""}
        >
          <option value="">Uncategorized</option>
          {kindCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {accounts.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="accountId">Account</Label>
          <Select
            id="accountId"
            name="accountId"
            defaultValue={existing?.accountId ?? ""}
          >
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="endDate">Ends (optional)</Label>
        <Input
          id="endDate"
          name="endDate"
          type="date"
          defaultValue={existing?.endDate ?? ""}
          aria-invalid={!!fieldErr.endDate}
        />
        {fieldErr.endDate && <ErrText>{fieldErr.endDate}</ErrText>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea
          id="note"
          name="note"
          placeholder="Any extra detail…"
          defaultValue={existing?.note ?? ""}
          maxLength={500}
        />
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : existing ? "Save changes" : "Add rule"}
      </Button>
    </form>
  );
}

function ErrText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-negative">{children}</p>;
}
