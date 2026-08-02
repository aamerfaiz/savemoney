"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Repeat } from "lucide-react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TransactionForm } from "./transaction-form";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatDateShort,
  type CurrencyCode,
} from "@/lib/format";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { useAutoOpenAdd } from "@/lib/nav/use-auto-open-add";
import { deleteTransaction, type ActionResult } from "@/lib/transactions/actions";
import type {
  Transaction,
  TransactionFilter,
  TransactionKind,
  TransactionSummary,
} from "@/lib/transactions/types";
import type {
  AccountOption,
  CategoryOption,
} from "@/lib/transactions/reference";

const TABS: { key: TransactionFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "income", label: "Income" },
  { key: "expense", label: "Expenses" },
];

/** Same shape `useActionState` needs — `transaction-form.tsx` binds
 * whichever create/update action it's given without caring what's behind
 * it: the real (vault-encrypting) path, or guest mode's IndexedDB path. */
type CreateAction = (
  prev: ActionResult | undefined,
  formData: FormData,
) => Promise<ActionResult>;
type UpdateAction = (
  id: string,
  kind: TransactionKind,
  prev: ActionResult | undefined,
  formData: FormData,
) => Promise<ActionResult>;

export function TransactionsView({
  transactions,
  summary,
  categories,
  accounts,
  filter,
  createAction,
  updateAction,
  deleteAction = deleteTransaction,
}: {
  transactions: Transaction[];
  summary: TransactionSummary;
  categories: CategoryOption[];
  accounts: AccountOption[];
  filter: TransactionFilter;
  createAction: CreateAction;
  updateAction: UpdateAction;
  /** Override for guest mode (IndexedDB) — same signature as the Server Action. */
  deleteAction?: typeof deleteTransaction;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(useAutoOpenAdd());
  const [editing, setEditing] = useState<Transaction | null>(null);
  const currency = summary.currency;

  // Optimistic list: deletes drop from the UI immediately, then the server
  // action + refresh confirm (or, on failure, the row reappears on refresh).
  const [items, removeItem] = useOptimistic(
    transactions,
    (state: Transaction[], id: string) => state.filter((t) => t.id !== id),
  );
  const groups = useMemo(() => groupByDate(items), [items]);

  const live = useMemo(() => {
    let income = 0;
    let expenses = 0;
    for (const t of items) {
      if (t.kind === "income") income += t.amount;
      else if (t.kind === "expense") expenses += t.amount;
      // transfers (savings movements) don't affect income/expense/net.
    }
    return { income, expenses, net: income - expenses, count: items.length };
  }, [items]);

  const onDelete = (t: Transaction) => {
    if (!confirm("Delete this transaction?")) return;
    startTransition(async () => {
      removeItem(t.id);
      await deleteAction(t.id, t.kind);
      invalidateFinanceData();
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            Transactions
          </h1>
          <p className="text-sm text-muted-foreground">
            {live.count} {live.count === 1 ? "entry" : "entries"}
          </p>
        </div>
        <Button className="hidden gap-1.5 sm:inline-flex" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Income" value={formatCurrency(live.income, currency)} tone="positive" />
        <SummaryTile label="Expenses" value={formatCurrency(live.expenses, currency)} tone="negative" />
        <SummaryTile
          label="Net"
          value={formatCurrency(live.net, currency, { showSign: true })}
          tone={live.net >= 0 ? "positive" : "negative"}
        />
      </div>

      {/* Filter tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/transactions" : `/transactions?filter=${t.key}`}
            scroll={false}
            className={cn(
              "rounded-[7px] py-1.5 text-center text-sm font-medium transition-colors",
              filter === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <EmptyState onAdd={() => setAdding(true)} />
      ) : (
        <div className="space-y-6">
          {groups.map(([date, rows]) => (
            <section key={date}>
              <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {formatGroupDate(date)}
              </h2>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {rows.map((t, i) => (
                  <TransactionRow
                    key={t.id}
                    t={t}
                    currency={currency}
                    onEdit={() => setEditing(t)}
                    onDelete={() => onDelete(t)}
                    divider={i > 0}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Mobile FAB */}
      <button
        onClick={() => setAdding(true)}
        aria-label="Add transaction"
        className="fixed bottom-24 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_8px_30px_-6px_var(--color-brand)] transition-transform active:scale-95 sm:hidden"
      >
        <Plus className="size-6" />
      </button>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add transaction"
        description="Record income or an expense."
      >
        <TransactionForm
          categories={categories}
          accounts={accounts}
          onSuccess={() => setAdding(false)}
          createAction={createAction}
          updateAction={updateAction}
        />
      </Dialog>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit transaction"
      >
        {editing && (
          <TransactionForm
            categories={categories}
            accounts={accounts}
            existing={editing}
            onSuccess={() => setEditing(null)}
            createAction={createAction}
            updateAction={updateAction}
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
  tone: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-base font-semibold tabular-nums lg:text-lg",
          tone === "positive" ? "text-positive" : "text-negative",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function TransactionRow({
  t,
  currency,
  onEdit,
  onDelete,
  divider,
}: {
  t: Transaction;
  currency: CurrencyCode;
  onEdit: () => void;
  onDelete: () => void;
  divider: boolean;
}) {
  const income = t.kind === "income";
  const transfer = t.kind === "transfer";

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/40",
        divider && "border-t border-border",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          income
            ? "bg-positive/15 text-positive"
            : transfer
              ? "bg-brand/15 text-brand"
              : "bg-muted text-muted-foreground",
        )}
      >
        <Icon name={t.categoryIcon} className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">
            {t.description ||
              t.categoryName ||
              (income ? "Income" : transfer ? "Transfer" : "Expense")}
          </span>
          {t.isRecurring && (
            <Repeat className="size-3 shrink-0 text-brand" aria-label="Recurring" />
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {t.categoryName ?? "Uncategorized"}
          {t.accountName ? ` · ${t.accountName}` : ""}
        </div>
      </div>

      <div className="text-right">
        <div
          className={cn(
            "text-sm font-semibold tabular-nums",
            income ? "text-positive" : transfer ? "text-brand" : "text-foreground",
          )}
        >
          {income ? "+" : transfer ? "→ " : "−"}
          {formatCurrency(t.amount, currency)}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {formatDateShort(t.date)}
        </div>
      </div>

      {!transfer && (
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
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">No transactions yet.</p>
      <Button variant="secondary" onClick={onAdd} className="gap-1.5">
        <Plus className="size-4" /> Add your first
      </Button>
    </div>
  );
}

function groupByDate(txns: Transaction[]): [string, Transaction[]][] {
  const map = new Map<string, Transaction[]>();
  for (const t of txns) {
    const arr = map.get(t.date) ?? [];
    arr.push(t);
    map.set(t.date, arr);
  }
  return [...map.entries()];
}

function formatGroupDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yest.toDateString();
  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
}
