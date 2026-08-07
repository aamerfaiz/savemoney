"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Receipt, Trash2, Users } from "lucide-react";

import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CollectionForm } from "./collection-form";
import { ParticipantsPanel } from "./participants-panel";
import { ExpenseForm } from "./expense-form";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@savemoney/finance-engine/format";
import { computeCollectionSummary } from "@savemoney/finance-engine/collections";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { deleteCollection, deleteExpense } from "@/lib/collections/actions";
import type {
  CollectionContributionRow,
  CollectionExpenseRow,
  CollectionParticipant,
  CollectionWithProgress,
} from "@/lib/collections/types";
import type { CategoryOption, AccountOption } from "@/lib/transactions/reference";

export type CollectionAction =
  | { type: "addParticipant"; participant: CollectionParticipant }
  | { type: "removeParticipant"; participantId: string }
  | { type: "addContribution"; contribution: CollectionContributionRow }
  | { type: "removeContribution"; contributionId: string }
  | { type: "migrateLegacy"; participant: CollectionParticipant; contributionIds: string[] }
  | { type: "addExpense"; expense: CollectionExpenseRow }
  | { type: "removeExpense"; expenseId: string };

function recompute(state: CollectionWithProgress): CollectionWithProgress {
  const totals = new Map<string, number>();
  for (const c of state.contributions) {
    if (c.participantId) totals.set(c.participantId, (totals.get(c.participantId) ?? 0) + c.amount);
  }
  const participants = state.participants.map((p) => ({
    ...p,
    totalContributed: totals.get(p.id) ?? 0,
  }));
  const summary = computeCollectionSummary(
    state.contributions.map((c) => ({ amount: c.amount })),
    state.expenses.map((e) => ({ amount: e.amount })),
    state.targetAmount,
  );
  return { ...state, participants, summary };
}

function collectionReducer(
  state: CollectionWithProgress,
  action: CollectionAction,
): CollectionWithProgress {
  switch (action.type) {
    case "addParticipant":
      return { ...state, participants: [action.participant, ...state.participants] };
    case "removeParticipant":
      return { ...state, participants: state.participants.filter((p) => p.id !== action.participantId) };
    case "addContribution":
      return recompute({ ...state, contributions: [action.contribution, ...state.contributions] });
    case "removeContribution":
      return recompute({
        ...state,
        contributions: state.contributions.filter((c) => c.id !== action.contributionId),
      });
    case "migrateLegacy": {
      const idSet = new Set(action.contributionIds);
      const contributions = state.contributions.map((c) =>
        idSet.has(c.id)
          ? { ...c, participantId: action.participant.id, contributorName: action.participant.displayName, isLegacy: false }
          : c,
      );
      return recompute({ ...state, participants: [action.participant, ...state.participants], contributions });
    }
    case "addExpense":
      return recompute({ ...state, expenses: [action.expense, ...state.expenses] });
    case "removeExpense":
      return recompute({ ...state, expenses: state.expenses.filter((e) => e.id !== action.expenseId) });
  }
}

export function CollectionDetailView({
  collection: initial,
  dek,
  expenseCategories,
  accounts,
}: {
  collection: CollectionWithProgress;
  dek: CryptoKey;
  expenseCategories: CategoryOption[];
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [, startTransition] = useTransition();
  const [collection, dispatch] = useOptimistic(initial, collectionReducer);
  const [editing, setEditing] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);

  const { summary } = collection;
  const collectedPct = summary.progress != null ? Math.round(summary.progress * 100) : null;
  const spentPct = Math.round(Math.min(1, summary.spentProgress) * 100);

  const onDeleteCollection = () => {
    if (!confirm(`Delete "${collection.title}"? This removes all of its participants, contributions, and expenses too.`)) return;
    startTransition(async () => {
      await deleteCollection(collection.id);
      invalidateFinanceData();
      router.push("/collections");
      router.refresh();
    });
  };

  const onDeleteExpense = (e: CollectionExpenseRow) => {
    if (!confirm("Remove this expense?")) return;
    startTransition(async () => {
      dispatch({ type: "removeExpense", expenseId: e.id });
      await deleteExpense(collection.id, e.id);
      invalidateFinanceData();
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/collections" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Collections
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-md",
              collection.status === "closed" ? "bg-muted text-muted-foreground" : "bg-brand/15 text-brand",
            )}
          >
            <Icon name={collection.icon ?? "gift"} className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight lg:text-2xl">{collection.title}</h1>
              {collection.status === "closed" && <Badge variant="default">Closed</Badge>}
            </div>
            {collection.purpose && <p className="text-sm text-muted-foreground">{collection.purpose}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setParticipantsOpen(true)}
            aria-label="Participants"
            className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 hover:bg-muted"
          >
            <AvatarStack participants={collection.participants} />
            <span className="text-xs font-medium tabular-nums">{collection.participants.length}</span>
          </button>
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit collection"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={onDeleteCollection}
            aria-label="Delete collection"
            className="rounded-md p-2 text-muted-foreground hover:bg-negative/15 hover:text-negative"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Collected</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-semibold tabular-nums">
              {formatCurrency(summary.totalCollected, collection.currency)}
            </span>
            {collection.targetAmount != null && (
              <span className="text-xs text-muted-foreground tabular-nums">
                of {formatCurrency(collection.targetAmount, collection.currency)}
              </span>
            )}
          </div>
          {collectedPct != null && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  summary.isFullyFunded ? "bg-positive" : "bg-brand",
                )}
                style={{ width: `${Math.min(100, collectedPct)}%` }}
              />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            {summary.isOverspent ? "Overspent" : "Remaining"}
          </p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={cn("text-xl font-semibold tabular-nums", summary.isOverspent && "text-negative")}>
              {formatCurrency(summary.balance, collection.currency)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatCurrency(summary.totalSpent, collection.currency)} spent
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                summary.isOverspent ? "bg-negative" : "bg-brand",
              )}
              style={{ width: `${spentPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Expenses</h2>
          {collection.status === "open" && (
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setAddingExpense(true)}>
              <Plus className="size-3.5" /> Add expense
            </Button>
          )}
        </div>

        {collection.expenses.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
            <Receipt className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nothing spent from this pool yet.</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {collection.expenses.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3 text-sm"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon name={e.categoryIcon ?? "receipt"} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.description || e.categoryName || "Expense"}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.spentAt}
                    {e.categoryName ? ` · ${e.categoryName}` : ""}
                    {e.paidByName ? ` · paid by ${e.paidByName}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatCurrency(e.amount, collection.currency)}
                </span>
                {collection.status === "open" && (
                  <button
                    onClick={() => onDeleteExpense(e)}
                    aria-label="Remove expense"
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-negative/15 hover:text-negative"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit collection">
        <CollectionForm existing={collection} onSuccess={() => setEditing(false)} dek={dek} />
      </Dialog>

      <Dialog
        open={addingExpense}
        onClose={() => setAddingExpense(false)}
        title="Add expense"
        description="Money spent out of this pool."
      >
        <ExpenseForm
          collection={collection}
          expenseCategories={expenseCategories}
          accounts={accounts}
          dek={dek}
          dispatch={dispatch}
          startTransition={startTransition}
          onSuccess={() => setAddingExpense(false)}
        />
      </Dialog>

      <ParticipantsPanel
        collection={collection}
        open={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
        dek={dek}
        dispatch={dispatch}
        startTransition={startTransition}
      />
    </div>
  );
}

function AvatarStack({ participants }: { participants: CollectionParticipant[] }) {
  const shown = participants.slice(0, 3);
  if (shown.length === 0) {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Users className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="flex -space-x-2">
      {shown.map((p) => (
        <span
          key={p.id}
          className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-brand/20 text-[10px] font-semibold text-brand"
        >
          {p.displayName.charAt(0).toUpperCase()}
        </span>
      ))}
    </span>
  );
}
