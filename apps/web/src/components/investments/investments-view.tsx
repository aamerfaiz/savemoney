"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, ShieldAlert } from "lucide-react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { InvestmentForm } from "./investment-form";
import { ContributionForm } from "./contribution-form";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@savemoney/finance-engine/format";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { useAutoOpenAdd } from "@/lib/nav/use-auto-open-add";
import { deleteInvestment } from "@/lib/investments/actions";
import type { InvestmentsData } from "@/lib/investments/compute";
import {
  INVESTMENT_TYPE_ICON,
  INVESTMENT_TYPE_LABEL,
  type InvestmentWithProjection,
} from "@/lib/investments/types";

export function InvestmentsView({
  data,
  dek,
  failedCount = 0,
}: {
  data: InvestmentsData;
  dek: CryptoKey;
  /** Investments that existed but couldn't be decrypted with the current
   * DEK — e.g. pre-3.5.4 rows saved before encryption was enabled. */
  failedCount?: number;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(useAutoOpenAdd());
  const [editing, setEditing] = useState<InvestmentWithProjection | null>(null);
  const [contributing, setContributing] =
    useState<InvestmentWithProjection | null>(null);
  const { currency } = data;

  const [investments, removeInvestment] = useOptimistic(
    data.investments,
    (state: InvestmentWithProjection[], id: string) =>
      state.filter((i) => i.id !== id),
  );

  const { totalValue, totalGain, totalReturn, projectedValue } = useMemo(() => {
    const totalValue = investments.reduce((s, i) => s + i.currentValue, 0);
    const totalInvested = investments.reduce((s, i) => s + i.investedAmount, 0);
    const totalGain = totalValue - totalInvested;
    return {
      totalValue,
      totalGain,
      totalReturn: totalInvested > 0 ? totalGain / totalInvested : 0,
      projectedValue: investments.reduce(
        (s, i) => s + i.projection.projectedValue,
        0,
      ),
    };
  }, [investments]);

  const onDelete = (i: InvestmentWithProjection) => {
    if (!confirm(`Delete "${i.name}"?`)) return;
    startTransition(async () => {
      removeInvestment(i.id);
      await deleteInvestment(i.id);
      invalidateFinanceData();
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            Investments
          </h1>
          <p className="text-sm text-muted-foreground">
            {investments.length}{" "}
            {investments.length === 1 ? "holding" : "holdings"}
          </p>
        </div>
        <Button
          className="hidden gap-1.5 sm:inline-flex"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4" /> Add investment
        </Button>
      </div>

      {failedCount > 0 && (
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-3 text-xs text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          {failedCount} {failedCount === 1 ? "investment" : "investments"}{" "}
          couldn&apos;t be read — saved before encryption was enabled and
          can&apos;t be recovered. Re-enter if you still need them.
        </p>
      )}

      {/* Portfolio summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile
          label="Portfolio value"
          value={formatCurrency(totalValue, currency)}
        />
        <SummaryTile
          label="Total gain"
          value={formatCurrency(totalGain, currency, { compact: true, showSign: true })}
          sub={formatPercent(totalReturn, 1)}
          tone={totalGain >= 0 ? "positive" : "negative"}
        />
        <SummaryTile
          label="Proj. value"
          value={formatCurrency(projectedValue, currency, { compact: true })}
          sub="10y"
          tone="brand"
        />
      </div>

      {/* Holding cards */}
      {investments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm text-muted-foreground">
            No investments tracked yet.
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
        <div className="space-y-3">
          {investments.map((i) => (
            <InvestmentCard
              key={i.id}
              i={i}
              onEdit={() => setEditing(i)}
              onContribute={() => setContributing(i)}
              onDelete={() => onDelete(i)}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => setAdding(true)}
        aria-label="Add investment"
        className="fixed bottom-24 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_8px_30px_-6px_var(--color-brand)] transition-transform active:scale-95 sm:hidden"
      >
        <Plus className="size-6" />
      </button>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add investment"
        description="Track a holding, its returns and projected growth."
      >
        <InvestmentForm onSuccess={() => setAdding(false)} dek={dek} />
      </Dialog>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit investment"
      >
        {editing && (
          <InvestmentForm
            existing={editing}
            onSuccess={() => setEditing(null)}
            dek={dek}
          />
        )}
      </Dialog>

      <Dialog
        open={!!contributing}
        onClose={() => setContributing(null)}
        title={contributing ? `Invest in ${contributing.name}` : "Contribute"}
      >
        {contributing && (
          <ContributionForm
            investment={contributing}
            onSuccess={() => setContributing(null)}
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
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative" | "brand";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-base font-semibold tabular-nums lg:text-lg",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "brand" && "text-brand",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>
      )}
    </div>
  );
}

function InvestmentCard({
  i,
  onEdit,
  onContribute,
  onDelete,
}: {
  i: InvestmentWithProjection;
  onEdit: () => void;
  onContribute: () => void;
  onDelete: () => void;
}) {
  const p = i.projection;
  const up = p.isUp;

  return (
    <div className="group rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-brand">
          <Icon name={INVESTMENT_TYPE_ICON[i.type]} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{i.name}</div>
          <div className="text-xs text-muted-foreground">
            {INVESTMENT_TYPE_LABEL[i.type]}
            {i.monthlyContribution
              ? ` · ${formatCurrency(i.monthlyContribution, i.currency)}/mo`
              : ""}
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

      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-lg font-semibold tabular-nums">
            {formatCurrency(i.currentValue, i.currency)}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            invested {formatCurrency(i.investedAmount, i.currency)}
          </div>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 text-sm font-medium tabular-nums",
            up ? "text-positive" : "text-negative",
          )}
        >
          {up ? (
            <TrendingUp className="size-4" />
          ) : (
            <TrendingDown className="size-4" />
          )}
          {formatCurrency(p.gain, i.currency, { compact: true, showSign: true })}
          <span className="text-xs">({formatPercent(p.returnPct, 1)})</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          Projected in {p.horizonYears}y @ {i.expectedReturn}%
        </span>
        <span className="font-semibold tabular-nums text-brand">
          {formatCurrency(p.projectedValue, i.currency, { compact: true })}
        </span>
      </div>

      <Button
        variant="secondary"
        size="sm"
        className="mt-4 w-full"
        onClick={onContribute}
      >
        Add contribution
      </Button>
    </div>
  );
}
