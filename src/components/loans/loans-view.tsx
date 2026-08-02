"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, TrendingDown, AlertTriangle, ShieldAlert } from "lucide-react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LoanForm } from "./loan-form";
import { PaymentForm } from "./payment-form";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { deleteLoan } from "@/lib/loans/actions";
import type { LoansData } from "@/lib/loans/compute";
import { LOAN_TYPE_ICON, type LoanWithProjection } from "@/lib/loans/types";

export function LoansView({
  data,
  dek,
  failedCount = 0,
}: {
  data: LoansData;
  dek: CryptoKey;
  /** Loans that existed but couldn't be decrypted with the current DEK —
   * e.g. pre-3.5.4 rows saved before encryption was enabled. */
  failedCount?: number;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LoanWithProjection | null>(null);
  const [paying, setPaying] = useState<LoanWithProjection | null>(null);
  const { currency } = data;

  const [loans, removeLoan] = useOptimistic(
    data.loans,
    (state: LoanWithProjection[], id: string) => state.filter((l) => l.id !== id),
  );
  const { totalRemaining, totalMonthlyEmi, totalInterestSaved } = useMemo(
    () => ({
      totalRemaining: loans.reduce((s, l) => s + l.remainingAmount, 0),
      totalMonthlyEmi: loans.reduce((s, l) => s + l.emi + (l.extraEmi ?? 0), 0),
      totalInterestSaved: loans.reduce((s, l) => s + l.projection.interestSaved, 0),
    }),
    [loans],
  );

  const onDelete = (l: LoanWithProjection) => {
    if (!confirm(`Delete "${l.name}"?`)) return;
    startTransition(async () => {
      removeLoan(l.id);
      await deleteLoan(l.id);
      invalidateFinanceData();
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">Loans</h1>
          <p className="text-sm text-muted-foreground">
            {loans.length} {loans.length === 1 ? "loan" : "loans"}
          </p>
        </div>
        <Button className="hidden gap-1.5 sm:inline-flex" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add loan
        </Button>
      </div>

      {failedCount > 0 && (
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-3 text-xs text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          {failedCount} {failedCount === 1 ? "loan" : "loans"} couldn&apos;t be
          read — saved before encryption was enabled and can&apos;t be
          recovered. Re-enter if you still need them.
        </p>
      )}

      {/* Portfolio summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Total debt" value={formatCurrency(totalRemaining, currency)} />
        <SummaryTile label="Monthly EMI" value={formatCurrency(totalMonthlyEmi, currency)} />
        <SummaryTile
          label="Interest saved"
          value={formatCurrency(totalInterestSaved, currency, { compact: true })}
          tone="positive"
        />
      </div>

      {/* Loan cards */}
      {loans.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm text-muted-foreground">No loans tracked yet.</p>
          <Button variant="secondary" onClick={() => setAdding(true)} className="gap-1.5">
            <Plus className="size-4" /> Add your first
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {loans.map((l) => (
            <LoanCard
              key={l.id}
              l={l}
              onEdit={() => setEditing(l)}
              onPay={() => setPaying(l)}
              onDelete={() => onDelete(l)}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => setAdding(true)}
        aria-label="Add loan"
        className="fixed bottom-24 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_8px_30px_-6px_var(--color-brand)] transition-transform active:scale-95 sm:hidden"
      >
        <Plus className="size-6" />
      </button>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add loan"
        description="Track an EMI, its payoff and interest saved."
      >
        <LoanForm onSuccess={() => setAdding(false)} dek={dek} />
      </Dialog>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Edit loan">
        {editing && (
          <LoanForm existing={editing} onSuccess={() => setEditing(null)} dek={dek} />
        )}
      </Dialog>

      <Dialog
        open={!!paying}
        onClose={() => setPaying(null)}
        title={paying ? `Pay ${paying.name}` : "Record payment"}
      >
        {paying && (
          <PaymentForm loan={paying} onSuccess={() => setPaying(null)} dek={dek} />
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
  tone?: "positive";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-base font-semibold tabular-nums lg:text-lg",
          tone === "positive" && "text-positive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function LoanCard({
  l,
  onEdit,
  onPay,
  onDelete,
}: {
  l: LoanWithProjection;
  onEdit: () => void;
  onPay: () => void;
  onDelete: () => void;
}) {
  const p = l.projection;
  const pct = p.progress != null ? Math.round(p.progress * 100) : 0;

  return (
    <div className="group rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-brand">
          <Icon name={LOAN_TYPE_ICON[l.type]} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{l.name}</div>
          <div className="text-xs text-muted-foreground">
            {l.interestRate}% · EMI {formatCurrency(l.emi, l.currency)}
            {l.extraEmi ? ` + ${formatCurrency(l.extraEmi, l.currency)}` : ""}
          </div>
        </div>
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
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold tabular-nums">
            {formatCurrency(l.remainingAmount, l.currency)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            of {formatCurrency(l.principal, l.currency)}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="font-medium tabular-nums">{pct}% paid off</span>
          {p.underwater ? (
            <span className="inline-flex items-center gap-1 text-negative">
              <AlertTriangle className="size-3.5" /> EMI below interest
            </span>
          ) : (
            <span className="text-muted-foreground">
              {p.hasExtra && p.withExtra.payoffDate
                ? `Payoff ${formatMonthYear(p.withExtra.payoffDate)}`
                : p.base.payoffDate
                  ? `Payoff ${formatMonthYear(p.base.payoffDate)}`
                  : "—"}
            </span>
          )}
        </div>
      </div>

      {p.hasExtra && p.interestSaved > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-positive/10 px-3 py-2 text-xs text-positive">
          <TrendingDown className="size-4 shrink-0" />
          Extra EMI saves {formatCurrency(p.interestSaved, l.currency)} in interest
          {p.monthsSaved > 0 ? ` · ${formatMonths(p.monthsSaved)} earlier` : ""}
        </div>
      )}

      {!p.underwater && l.remainingAmount > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4 w-full"
          onClick={onPay}
        >
          Record payment
        </Button>
      )}
    </div>
  );
}

function formatMonthYear(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(iso + "T00:00:00"));
}

function formatMonths(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y && m) return `${y}y ${m}m`;
  if (y) return `${y}y`;
  return `${m}mo`;
}
