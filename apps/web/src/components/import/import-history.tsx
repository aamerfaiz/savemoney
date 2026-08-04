"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@savemoney/finance-engine/format";
import { rollbackImport } from "@/lib/import/actions";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import type { ImportBatchSummary } from "@/lib/import/queries";

export function ImportHistory({ batches }: { batches: ImportBatchSummary[] }) {
  if (batches.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Recent imports
      </h2>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {batches.map((b, i) => (
          <BatchRow key={b.id} b={b} divider={i > 0} />
        ))}
      </div>
    </div>
  );
}

function BatchRow({ b, divider }: { b: ImportBatchSummary; divider: boolean }) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [pending, startTransition] = useTransition();
  const rolledBack = b.status === "rolled_back";

  const undo = () => {
    if (!confirm("Undo this import? Its rows will be removed.")) return;
    startTransition(async () => {
      await rollbackImport(b.id);
      invalidateFinanceData();
      router.refresh();
    });
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        divider && "border-t border-border",
        (pending || rolledBack) && "opacity-60",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <FileText className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {b.filename ?? "Import"}
        </div>
        <div className="text-xs text-muted-foreground">
          {b.importedRows} imported
          {b.duplicateRows ? ` · ${b.duplicateRows} dup` : ""} ·{" "}
          {formatDateShort(b.createdAt)}
        </div>
      </div>
      {rolledBack ? (
        <Badge>Rolled back</Badge>
      ) : (
        <button
          onClick={undo}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-negative/15 hover:text-negative"
        >
          <Undo2 className="size-3.5" /> Undo
        </button>
      )}
    </div>
  );
}
