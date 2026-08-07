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
import { ContributorsPanel } from "./contributors-panel";
import { ExpenseForm } from "./expense-form";
import { TripExpenseForm } from "./trip-expense-form";
import { BalancesPanel } from "./balances-panel";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@savemoney/finance-engine/format";
import {
  computeCollectionSummary,
  computeTripBalances,
  simplifySettlements,
} from "@savemoney/finance-engine/collections";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { deleteCollection, deleteExpense } from "@/lib/collections/actions";
import { legacyContributorId } from "@/lib/collections/compute";
import type {
  CollectionContributionRow,
  CollectionContributor,
  CollectionExpenseRow,
  CollectionSettlementRow,
  CollectionWithProgress,
} from "@/lib/collections/types";
import type { CategoryOption, AccountOption } from "@/lib/transactions/reference";

export type CollectionAction =
  | { type: "addContributor"; contributor: CollectionContributor }
  | { type: "removeContributor"; contributorId: string }
  | { type: "addContribution"; contribution: CollectionContributionRow }
  | { type: "updateContribution"; contributionId: string; fields: Partial<CollectionContributionRow> }
  | { type: "removeContribution"; contributionId: string }
  | { type: "linkLegacy"; contributor: CollectionContributor; contributionIds: string[] }
  | { type: "addExpense"; expense: CollectionExpenseRow }
  | { type: "removeExpense"; expenseId: string }
  | { type: "addSettlement"; settlement: CollectionSettlementRow }
  | { type: "removeSettlement"; settlementId: string };

function recompute(state: CollectionWithProgress): CollectionWithProgress {
  const totals = new Map<string, number>();
  for (const c of state.contributions) {
    totals.set(c.contributorId, (totals.get(c.contributorId) ?? 0) + c.amount);
  }
  const contributors = state.contributors.map((p) => ({
    ...p,
    totalContributed: totals.get(p.id) ?? 0,
  }));
  const summary = computeCollectionSummary(
    state.contributions.map((c) => ({ amount: c.amount })),
    state.expenses.map((e) => ({ amount: e.amount })),
    state.targetAmount,
  );

  const nameById = new Map(contributors.map((c) => [c.id, c.displayName]));
  const balances =
    state.type === "trip"
      ? computeTripBalances(
          state.expenses.map((e) => ({ payers: e.payers, splits: e.splits })),
          state.settlements,
        )
      : [];
  const suggestedSettlements =
    state.type === "trip"
      ? simplifySettlements(balances).map((s) => ({
          ...s,
          fromName: nameById.get(s.fromContributorId) ?? "Unknown",
          toName: nameById.get(s.toContributorId) ?? "Unknown",
        }))
      : [];

  return { ...state, contributors, summary, balances, suggestedSettlements };
}

function collectionReducer(
  state: CollectionWithProgress,
  action: CollectionAction,
): CollectionWithProgress {
  switch (action.type) {
    case "addContributor":
      return { ...state, contributors: [action.contributor, ...state.contributors] };
    case "removeContributor":
      return { ...state, contributors: state.contributors.filter((p) => p.id !== action.contributorId) };
    case "addContribution":
      return recompute({ ...state, contributions: [action.contribution, ...state.contributions] });
    case "updateContribution":
      return recompute({
        ...state,
        contributions: state.contributions.map((c) =>
          c.id === action.contributionId ? { ...c, ...action.fields } : c,
        ),
      });
    case "removeContribution":
      return recompute({
        ...state,
        contributions: state.contributions.filter((c) => c.id !== action.contributionId),
      });
    case "linkLegacy": {
      const idSet = new Set(action.contributionIds);
      const contributions = state.contributions.map((c) =>
        idSet.has(c.id)
          ? { ...c, contributorId: action.contributor.id, contributorName: action.contributor.displayName }
          : c,
      );
      const contributors = state.contributors
        .filter((p) => p.id !== legacyContributorId(action.contributor.displayName))
        .concat(action.contributor);
      return recompute({ ...state, contributors, contributions });
    }
    case "addExpense":
      return recompute({ ...state, expenses: [action.expense, ...state.expenses] });
    case "removeExpense":
      return recompute({ ...state, expenses: state.expenses.filter((e) => e.id !== action.expenseId) });
    case "addSettlement":
      return recompute({ ...state, settlements: [action.settlement, ...state.settlements] });
    case "removeSettlement":
      return recompute({
        ...state,
        settlements: state.settlements.filter((s) => s.id !== action.settlementId),
      });
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
  const [contributorsOpen, setContributorsOpen] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);

  const { summary } = collection;
  const collectedPct = summary.progress != null ? Math.round(summary.progress * 100) : null;
  const spentPct = Math.round(Math.min(1, summary.spentProgress) * 100);

  const onDeleteCollection = () => {
    if (!confirm(`Delete "${collection.title}"? This removes all of its contributors, contributions, and expenses too.`)) return;
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
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-md",
              collection.status === "closed" ? "bg-muted text-muted-foreground" : "bg-brand/15 text-brand",
            )}
          >
            <Icon name={collection.icon ?? "gift"} className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight lg:text-2xl">{collection.title}</h1>
              {collection.status === "closed" && <Badge variant="default" className="shrink-0">Closed</Badge>}
            </div>
            {collection.purpose && <p className="truncate text-sm text-muted-foreground">{collection.purpose}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setContributorsOpen(true)}
            aria-label="Contributors"
            className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 hover:bg-muted"
          >
            <AvatarStack contributors={collection.contributors} />
            <span className="text-xs font-medium tabular-nums">{collection.contributors.length}</span>
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

      {collection.type === "pool" && (
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
      )}

      {collection.type === "trip" && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total spent</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatCurrency(summary.totalSpent, collection.currency)}
          </p>
        </div>
      )}

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
            <p className="text-sm text-muted-foreground">
              {collection.type === "trip" ? "No expenses logged yet." : "Nothing spent from this pool yet."}
            </p>
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
                  <p className="truncate text-xs text-muted-foreground">
                    {e.spentAt}
                    {e.categoryName ? ` · ${e.categoryName}` : ""}
                    {collection.type === "pool" && e.paidByName ? ` · paid by ${e.paidByName}` : ""}
                    {collection.type === "trip" && e.payers.length > 0
                      ? ` · paid by ${e.payers.map((p) => p.contributorName).join(", ")}`
                      : ""}
                    {collection.type === "trip" && e.splits.length > 0
                      ? ` · split between ${e.splits.map((s) => s.contributorName).join(", ")}`
                      : ""}
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

      {collection.type === "trip" && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Balances</h2>
          <BalancesPanel collection={collection} dek={dek} dispatch={dispatch} startTransition={startTransition} />
        </div>
      )}

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit collection">
        <CollectionForm existing={collection} onSuccess={() => setEditing(false)} dek={dek} />
      </Dialog>

      <Dialog
        open={addingExpense}
        onClose={() => setAddingExpense(false)}
        title="Add expense"
        description={collection.type === "trip" ? "Who paid, and who it's split between." : "Money spent out of this pool."}
      >
        {collection.type === "trip" ? (
          <TripExpenseForm
            collection={collection}
            expenseCategories={expenseCategories}
            accounts={accounts}
            dek={dek}
            dispatch={dispatch}
            startTransition={startTransition}
            onSuccess={() => setAddingExpense(false)}
          />
        ) : (
          <ExpenseForm
            collection={collection}
            expenseCategories={expenseCategories}
            accounts={accounts}
            dek={dek}
            dispatch={dispatch}
            startTransition={startTransition}
            onSuccess={() => setAddingExpense(false)}
          />
        )}
      </Dialog>

      <ContributorsPanel
        collection={collection}
        open={contributorsOpen}
        onClose={() => setContributorsOpen(false)}
        dek={dek}
        dispatch={dispatch}
        startTransition={startTransition}
      />
    </div>
  );
}

function AvatarStack({ contributors }: { contributors: CollectionContributor[] }) {
  const shown = contributors.slice(0, 3);
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
