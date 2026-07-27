"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { BudgetCard } from "@/components/dashboard/budget-card";
import { BudgetForm } from "./budget-form";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/format";
import { deleteBudget } from "@/lib/budgets/actions";
import type { BudgetsData } from "@/lib/budgets/queries";
import type { BudgetWithProgress } from "@/lib/budgets/types";
import type { CategoryOption } from "@/lib/transactions/reference";

export function BudgetsView({
  data,
  categories,
  readOnly,
}: {
  data: BudgetsData;
  categories: CategoryOption[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BudgetWithProgress | null>(null);
  const { safeToSpend, currency } = data;

  const [budgets, removeBudget] = useOptimistic(
    data.budgets,
    (state: BudgetWithProgress[], id: string) => state.filter((b) => b.id !== id),
  );
  const overspent = budgets.filter((b) => b.status === "over");

  const onDelete = (b: BudgetWithProgress) => {
    if (!confirm("Delete this budget?")) return;
    startTransition(async () => {
      removeBudget(b.id);
      await deleteBudget(b.id);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Budget</h1>
          <p className="text-sm text-muted-foreground">
            Safe-to-spend and category limits
          </p>
        </div>
        <Button className="hidden gap-1.5 sm:inline-flex" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> New budget
        </Button>
      </div>

      {readOnly && (
        <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Demo mode — sign in with Supabase configured to set and save real
          budgets.
        </div>
      )}

      {/* Safe-to-spend (dynamic budgeting engine) */}
      <Card className="p-5">
        <BudgetCard budget={safeToSpend} currency={currency} />
      </Card>

      {overspent.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          <AlertTriangle className="size-4 shrink-0" />
          {overspent.length === 1
            ? `You've overspent your ${overspent[0].categoryName ?? "overall"} budget.`
            : `${overspent.length} budgets are over their limit.`}
        </div>
      )}

      {/* Category budgets */}
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Category budgets
          </h2>
          <span className="text-xs text-muted-foreground">
            {budgets.length} {budgets.length === 1 ? "budget" : "budgets"}
          </span>
        </div>

        {budgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
            <p className="text-sm text-muted-foreground">No budgets yet.</p>
            <Button variant="secondary" onClick={() => setAdding(true)} className="gap-1.5">
              <Plus className="size-4" /> Create your first
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {budgets.map((b) => (
              <BudgetRow
                key={b.id}
                b={b}
                readOnly={readOnly}
                onEdit={() => setEditing(b)}
                onDelete={() => onDelete(b)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => setAdding(true)}
        aria-label="New budget"
        className="fixed bottom-24 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_8px_30px_-6px_var(--color-brand)] transition-transform active:scale-95 sm:hidden"
      >
        <Plus className="size-6" />
      </button>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="New budget"
        description="Set a spending limit for a category or overall."
      >
        <BudgetForm categories={categories} onSuccess={() => setAdding(false)} />
      </Dialog>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Edit budget">
        {editing && (
          <BudgetForm
            categories={categories}
            existing={editing}
            onSuccess={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function BudgetRow({
  b,
  readOnly,
  onEdit,
  onDelete,
}: {
  b: BudgetWithProgress;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pct = Math.min(100, Math.round(b.utilization * 100));

  const meterColor =
    b.status === "over"
      ? "var(--color-negative)"
      : b.status === "warning"
        ? "var(--color-warning)"
        : "var(--color-brand)";

  return (
    <div className="group rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-brand">
          <Icon name={b.categoryIcon ?? "target"} className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">
              {b.categoryName ?? "Overall"}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
              {b.period}
            </span>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(b.spent, b.currency)} of{" "}
            {formatCurrency(b.amount, b.currency)}
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
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
        )}
      </div>

      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%`, backgroundColor: meterColor }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span
            className={cn(
              "font-medium",
              b.status === "over" && "text-negative",
              b.status === "warning" && "text-warning",
            )}
          >
            {formatPercent(b.utilization)} used
          </span>
          <span className="text-muted-foreground tabular-nums">
            {b.remaining >= 0
              ? `${formatCurrency(b.remaining, b.currency)} left`
              : `${formatCurrency(Math.abs(b.remaining), b.currency)} over`}
          </span>
        </div>
      </div>
    </div>
  );
}
