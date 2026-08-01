"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Play, Pause, ShieldAlert } from "lucide-react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { RecurringForm } from "./recurring-form";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateShort, daysUntil } from "@/lib/format";
import {
  deleteRecurringRule,
  toggleRecurringRule,
} from "@/lib/recurring/actions";
import type { RecurringData } from "@/lib/recurring/compute";
import {
  cadenceLabel,
  type RecurringRuleWithSchedule,
} from "@/lib/recurring/types";
import type {
  AccountOption,
  CategoryOption,
} from "@/lib/transactions/reference";

export function RecurringView({
  data,
  categories,
  accounts,
  dek,
  failedCount = 0,
}: {
  data: RecurringData;
  categories: CategoryOption[];
  accounts: AccountOption[];
  dek: CryptoKey;
  /** Rules that existed but couldn't be decrypted with the current DEK —
   * e.g. pre-3.5.4 rows saved before encryption was enabled. */
  failedCount?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RecurringRuleWithSchedule | null>(null);
  const { currency } = data;

  const [rules, removeRule] = useOptimistic(
    data.rules,
    (state: RecurringRuleWithSchedule[], id: string) =>
      state.filter((r) => r.id !== id),
  );

  const { monthlyExpense, monthlyIncome, netMonthly } = useMemo(() => {
    const active = rules.filter((r) => r.isActive && r.nextDate);
    const monthlyExpense = active
      .filter((r) => r.kind === "expense")
      .reduce((s, r) => s + r.monthlyAmount, 0);
    const monthlyIncome = active
      .filter((r) => r.kind === "income")
      .reduce((s, r) => s + r.monthlyAmount, 0);
    return {
      monthlyExpense,
      monthlyIncome,
      netMonthly: monthlyIncome - monthlyExpense,
    };
  }, [rules]);

  const onDelete = (r: RecurringRuleWithSchedule) => {
    if (!confirm(`Delete "${r.name}"?`)) return;
    startTransition(async () => {
      removeRule(r.id);
      await deleteRecurringRule(r.id);
      router.refresh();
    });
  };

  const onToggle = (r: RecurringRuleWithSchedule) => {
    startTransition(async () => {
      await toggleRecurringRule(r.id, !r.isActive);
      router.refresh();
    });
  };

  // Sort by soonest upcoming; paused rules sink to the bottom.
  const sorted = useMemo(
    () =>
      [...rules].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (!a.nextDate) return 1;
        if (!b.nextDate) return -1;
        return a.nextDate.localeCompare(b.nextDate);
      }),
    [rules],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            Recurring
          </h1>
          <p className="text-sm text-muted-foreground">
            {rules.length} {rules.length === 1 ? "rule" : "rules"}
          </p>
        </div>
        <Button
          className="hidden gap-1.5 sm:inline-flex"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4" /> Add rule
        </Button>
      </div>

      {failedCount > 0 && (
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-3 text-xs text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          {failedCount} {failedCount === 1 ? "rule" : "rules"} couldn&apos;t
          be read — saved before encryption was enabled and can&apos;t be
          recovered. Re-enter if you still need them.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <SummaryTile
          label="Monthly in"
          value={formatCurrency(monthlyIncome, currency, { compact: true })}
          tone="positive"
        />
        <SummaryTile
          label="Monthly out"
          value={formatCurrency(monthlyExpense, currency, { compact: true })}
          tone="negative"
        />
        <SummaryTile
          label="Net / mo"
          value={formatCurrency(netMonthly, currency, {
            compact: true,
            showSign: true,
          })}
          tone={netMonthly >= 0 ? "positive" : "negative"}
        />
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm text-muted-foreground">
            No recurring rules yet.
          </p>
          <Button
            variant="secondary"
            onClick={() => setAdding(true)}
            className="gap-1.5"
          >
            <Plus className="size-4" /> Add your first
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((r) => (
            <RuleCard
              key={r.id}
              r={r}
              onEdit={() => setEditing(r)}
              onToggle={() => onToggle(r)}
              onDelete={() => onDelete(r)}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => setAdding(true)}
        aria-label="Add rule"
        className="fixed bottom-24 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_8px_30px_-6px_var(--color-brand)] transition-transform active:scale-95 sm:hidden"
      >
        <Plus className="size-6" />
      </button>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add recurring rule"
        description="A bill or income that repeats on a schedule."
      >
        <RecurringForm
          categories={categories}
          accounts={accounts}
          onSuccess={() => setAdding(false)}
          dek={dek}
        />
      </Dialog>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit recurring rule"
      >
        {editing && (
          <RecurringForm
            categories={categories}
            accounts={accounts}
            existing={editing}
            onSuccess={() => setEditing(null)}
            dek={dek}
          />
        )}
      </Dialog>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-base font-semibold tabular-nums lg:text-lg",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function RuleCard({
  r,
  onEdit,
  onToggle,
  onDelete,
}: {
  r: RecurringRuleWithSchedule;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const income = r.kind === "income";
  const days = r.nextDate ? daysUntil(r.nextDate) : null;
  const soon = days != null && days <= 3;

  return (
    <div
      className={cn(
        "group rounded-lg border border-border bg-card p-3.5",
        !r.isActive && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md bg-muted",
            income ? "text-positive" : "text-brand",
          )}
        >
          <Icon name={r.categoryIcon ?? (income ? "wallet" : "receipt")} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground">
            {cadenceLabel(r.frequency, r.interval)}
            {r.isActive && r.nextDate ? (
              <>
                {" · next "}
                {formatDateShort(r.nextDate)}
                <span className={cn("ml-1", soon && "text-warning")}>
                  {days != null &&
                    (days <= 0 ? "(today)" : `(in ${days}d)`)}
                </span>
              </>
            ) : (
              " · paused"
            )}
          </div>
        </div>
        <div className="text-right">
          <div
            className={cn(
              "text-sm font-semibold tabular-nums",
              income ? "text-positive" : "text-foreground",
            )}
          >
            {income ? "+" : ""}
            {formatCurrency(r.amount, r.currency)}
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {formatCurrency(r.monthlyAmount, r.currency, { compact: true })}/mo
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
          <button
            onClick={onToggle}
            aria-label={r.isActive ? "Pause" : "Resume"}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {r.isActive ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </button>
          <button
            onClick={onEdit}
            aria-label="Edit"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-negative/15 hover:text-negative"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
