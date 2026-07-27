"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, CircleAlert } from "lucide-react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { GoalForm } from "./goal-form";
import { ContributionForm } from "./contribution-form";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/format";
import { deleteGoal } from "@/lib/goals/actions";
import type { GoalsData } from "@/lib/goals/queries";
import type { GoalWithProgress } from "@/lib/goals/types";

export function GoalsView({
  data,
  readOnly,
}: {
  data: GoalsData;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GoalWithProgress | null>(null);
  const [contributing, setContributing] = useState<GoalWithProgress | null>(null);
  const { currency } = data;

  const [goals, removeGoal] = useOptimistic(
    data.goals,
    (state: GoalWithProgress[], id: string) => state.filter((g) => g.id !== id),
  );
  const { totalSaved, totalTarget } = useMemo(() => {
    const active = goals.filter(
      (g) => g.status === "active" || g.status === "completed",
    );
    return {
      totalSaved: active.reduce((s, g) => s + g.currentAmount, 0),
      totalTarget: active.reduce((s, g) => s + g.targetAmount, 0),
    };
  }, [goals]);
  const overallPct = totalTarget > 0 ? totalSaved / totalTarget : 0;

  const onDelete = (g: GoalWithProgress) => {
    if (!confirm(`Delete "${g.name}"?`)) return;
    startTransition(async () => {
      removeGoal(g.id);
      await deleteGoal(g.id);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            Savings Goals
          </h1>
          <p className="text-sm text-muted-foreground">
            {goals.length} {goals.length === 1 ? "goal" : "goals"}
          </p>
        </div>
        <Button className="hidden gap-1.5 sm:inline-flex" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> New goal
        </Button>
      </div>

      {readOnly && (
        <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Demo mode — sign in with Supabase configured to create and fund real
          goals.
        </div>
      )}

      {/* Overall summary */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Total saved</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {formatCurrency(totalSaved, currency)}
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground tabular-nums">
            of {formatCurrency(totalTarget, currency)}
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500"
            style={{ width: `${Math.min(100, overallPct * 100)}%` }}
          />
        </div>
        <div className="mt-1.5 text-xs text-muted-foreground">
          {formatPercent(overallPct)} of all goals funded
        </div>
      </div>

      {/* Goal cards */}
      {goals.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm text-muted-foreground">No goals yet.</p>
          <Button variant="secondary" onClick={() => setAdding(true)} className="gap-1.5">
            <Plus className="size-4" /> Create your first
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              g={g}
              readOnly={readOnly}
              onEdit={() => setEditing(g)}
              onContribute={() => setContributing(g)}
              onDelete={() => onDelete(g)}
            />
          ))}
        </div>
      )}

      {/* Mobile FAB */}
      <button
        onClick={() => setAdding(true)}
        aria-label="New goal"
        className="fixed bottom-24 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_8px_30px_-6px_var(--color-brand)] transition-transform active:scale-95 sm:hidden"
      >
        <Plus className="size-6" />
      </button>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="New goal"
        description="Set a target and track your progress."
      >
        <GoalForm onSuccess={() => setAdding(false)} />
      </Dialog>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Edit goal">
        {editing && (
          <GoalForm existing={editing} onSuccess={() => setEditing(null)} />
        )}
      </Dialog>

      <Dialog
        open={!!contributing}
        onClose={() => setContributing(null)}
        title={contributing ? `Add to ${contributing.name}` : "Add contribution"}
      >
        {contributing && (
          <ContributionForm
            goal={contributing}
            onSuccess={() => setContributing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

const PRIORITY_STYLE: Record<GoalWithProgress["priority"], string> = {
  high: "bg-brand/15 text-brand",
  medium: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
};

function GoalCard({
  g,
  readOnly,
  onEdit,
  onContribute,
  onDelete,
}: {
  g: GoalWithProgress;
  readOnly: boolean;
  onEdit: () => void;
  onContribute: () => void;
  onDelete: () => void;
}) {
  const pct = Math.round(g.projection.progress * 100);
  const done = g.projection.isComplete;

  return (
    <div className="group flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md",
            done ? "bg-positive/15 text-positive" : "bg-muted text-brand",
          )}
        >
          <Icon name={g.icon ?? "target"} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{g.name}</div>
          <span
            className={cn(
              "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
              PRIORITY_STYLE[g.priority],
            )}
          >
            {g.priority} priority
          </span>
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
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold tabular-nums">
            {formatCurrency(g.currentAmount, g.currency)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            of {formatCurrency(g.targetAmount, g.currency)}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              done ? "bg-positive" : "bg-brand",
            )}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="font-medium tabular-nums">{pct}%</span>
          <ProjectionNote g={g} />
        </div>
      </div>

      {!readOnly && !done && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4 w-full gap-1.5"
          onClick={onContribute}
        >
          <Plus className="size-4" /> Add money
        </Button>
      )}
    </div>
  );
}

function ProjectionNote({ g }: { g: GoalWithProgress }) {
  const p = g.projection;
  if (p.isComplete) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-positive">
        <Check className="size-3.5" /> Completed
      </span>
    );
  }
  if (g.deadline && p.onTrack === false && p.requiredMonthly != null) {
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <CircleAlert className="size-3.5" />
        Need {formatCurrency(p.requiredMonthly, g.currency)}/mo
      </span>
    );
  }
  if (p.expectedCompletion) {
    return (
      <span className="text-muted-foreground">
        Done {formatMonthYear(p.expectedCompletion)}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground tabular-nums">
      {formatCurrency(p.remaining, g.currency)} to go
    </span>
  );
}

function formatMonthYear(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(iso + "T00:00:00"));
}
