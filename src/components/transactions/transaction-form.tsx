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
  createTransaction,
  updateTransaction,
  type ActionResult,
} from "@/lib/transactions/actions";
import {
  FREQUENCIES,
  INCOME_SOURCE_TYPES,
  type Transaction,
  type TransactionKind,
} from "@/lib/transactions/types";
import type {
  AccountOption,
  CategoryOption,
} from "@/lib/transactions/reference";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function TransactionForm({
  categories,
  accounts,
  existing,
  onSuccess,
  createAction = createTransaction,
  updateAction = updateTransaction,
}: {
  categories: CategoryOption[];
  accounts: AccountOption[];
  existing?: Transaction;
  onSuccess: () => void;
  /** Override for guest mode (IndexedDB) — same signature as the Server Action. */
  createAction?: typeof createTransaction;
  /** Override for guest mode (IndexedDB) — same signature as the Server Action. */
  updateAction?: typeof updateTransaction;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<TransactionKind>(existing?.kind ?? "expense");
  const [isRecurring, setIsRecurring] = useState(existing?.isRecurring ?? false);

  const action = existing
    ? updateAction.bind(null, existing.id, existing.kind)
    : createAction;
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
      {/* Kind toggle */}
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
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={existing?.date ?? todayISO()}
            aria-invalid={!!fieldErr.date}
            required
          />
          {fieldErr.date && <ErrText>{fieldErr.date}</ErrText>}
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

      {kind === "income" && (
        <div className="space-y-1.5">
          <Label htmlFor="sourceType">Source</Label>
          <Select
            id="sourceType"
            name="sourceType"
            defaultValue={existing?.sourceType ?? "salary"}
          >
            {INCOME_SOURCE_TYPES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          placeholder={kind === "income" ? "e.g. Monthly salary" : "e.g. Groceries at Whole Foods"}
          defaultValue={existing?.description ?? ""}
          maxLength={200}
        />
      </div>

      {kind === "expense" && (
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
      )}

      {/* Recurring */}
      <div className="rounded-md border border-border p-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Recurring</span>
          <input
            type="checkbox"
            name="isRecurring"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="size-4 accent-[var(--color-brand)]"
          />
        </label>
        {isRecurring && (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="frequency">Repeats</Label>
            <Select
              id="frequency"
              name="frequency"
              defaultValue={existing?.frequency ?? "monthly"}
            >
              {FREQUENCIES.filter((f) => f !== "one_time").map((f) => (
                <option key={f} value={f} className="capitalize">
                  {f.replace("_", " ")}
                </option>
              ))}
            </Select>
            {fieldErr.frequency && <ErrText>{fieldErr.frequency}</ErrText>}
          </div>
        )}
        {!isRecurring && (
          <input type="hidden" name="frequency" value="one_time" />
        )}
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending
          ? "Saving…"
          : existing
            ? "Save changes"
            : `Add ${kind}`}
      </Button>
    </form>
  );
}

function ErrText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-negative">{children}</p>;
}
