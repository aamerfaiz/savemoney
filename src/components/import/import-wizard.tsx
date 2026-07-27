"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  Upload,
  FileText,
  ArrowLeft,
  Check,
  AlertTriangle,
  CopyCheck,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  commitImport,
  previewImport,
  rollbackImport,
} from "@/lib/import/actions";
import { detectMapping } from "@/lib/import/pipeline";
import type {
  ColumnMapping,
  CommitResult,
  ImportField,
  ImportPreview,
} from "@/lib/import/types";
import type { TransactionKind } from "@/lib/transactions/types";

type Step = "upload" | "map" | "preview" | "done";

const FIELDS: { key: ImportField; label: string; required?: boolean }[] = [
  { key: "date", label: "Date", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "type", label: "Type (income/expense)" },
];

const SAMPLE_CSV = `Date,Description,Category,Amount,Type
2026-07-26,Whole Foods,Groceries,84.20,expense
2026-07-26,Monthly Salary,Salary,8200,income
2026-07-25,Netflix,Entertainment,15.99,expense
2026-07-25,Shell Fuel,Fuel,52.40,expense
2026-07-24,Dividend VOO,Dividend,42.10,income
2026-07-26,Whole Foods,Groceries,84.20,expense`;

export function ImportWizard({ readOnly }: { readOnly: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping());
  const [defaultKind, setDefaultKind] = useState<TransactionKind>("expense");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function ingest(text: string, name: string) {
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    const fields = parsed.meta.fields ?? [];
    if (fields.length === 0 || parsed.data.length === 0) {
      setError("Couldn't find any rows in that file.");
      return;
    }
    setError(null);
    setFilename(name);
    setHeaders(fields);
    setRows(parsed.data);
    setMapping(detectMapping(fields));
    setStep("map");
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((t) => ingest(t, file.name));
  }

  function runPreview() {
    setError(null);
    startTransition(async () => {
      const p = await previewImport({ rows, mapping, defaultKind });
      setPreview(p);
      setStep("preview");
    });
  }

  function runCommit() {
    setError(null);
    startTransition(async () => {
      const r = await commitImport({
        rows,
        mapping,
        defaultKind,
        filename,
        skipDuplicates,
      });
      if (!r.ok) {
        setError(r.error ?? "Import failed.");
        return;
      }
      setResult(r);
      setStep("done");
      router.refresh();
    });
  }

  function undo() {
    if (!result?.batchId) return;
    startTransition(async () => {
      await rollbackImport(result.batchId!);
      router.refresh();
      reset();
    });
  }

  function reset() {
    setStep("upload");
    setFilename("");
    setHeaders([]);
    setRows([]);
    setMapping(emptyMapping());
    setPreview(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <Stepper step={step} />

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
          <AlertTriangle className="size-4 shrink-0" /> {error}
        </div>
      )}

      {/* Step 1 — upload */}
      {step === "upload" && (
        <div className="mt-5">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center transition-colors hover:border-brand/60 hover:bg-muted/40"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand">
              <Upload className="size-6" />
            </span>
            <span className="text-sm font-medium">Choose a CSV file</span>
            <span className="text-xs text-muted-foreground">
              Bank, credit-card or custom exports
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFile}
          />
          <div className="mt-3 text-center">
            <button
              onClick={() => ingest(SAMPLE_CSV, "sample.csv")}
              className="text-xs text-brand hover:underline"
            >
              or load a sample file
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — map columns */}
      {step === "map" && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="size-4" /> {filename} · {rows.length} rows
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`map-${f.key}`}>
                  {f.label}
                  {f.required && <span className="text-negative"> *</span>}
                </Label>
                <Select
                  id={`map-${f.key}`}
                  value={mapping[f.key] ?? ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [f.key]: e.target.value || null })
                  }
                >
                  <option value="">— None —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="defaultKind">Default type (when unknown)</Label>
              <Select
                id="defaultKind"
                value={defaultKind}
                onChange={(e) => setDefaultKind(e.target.value as TransactionKind)}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
            </div>
          </div>

          <RawPreview headers={headers} rows={rows} mapping={mapping} />

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button variant="ghost" onClick={reset} className="gap-1.5">
              <ArrowLeft className="size-4" /> Start over
            </Button>
            <Button
              onClick={runPreview}
              disabled={pending || !mapping.date || !mapping.amount}
            >
              {pending ? "Analyzing…" : "Preview"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — preview */}
      {step === "preview" && preview && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <CountTile label="New" value={preview.summary.new} tone="positive" />
            <CountTile label="Duplicates" value={preview.summary.duplicate} tone="warning" />
            <CountTile label="Errors" value={preview.summary.error} tone="negative" />
          </div>

          {preview.summary.duplicate > 0 && (
            <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <span className="flex items-center gap-2 text-sm">
                <CopyCheck className="size-4 text-warning" />
                Skip {preview.summary.duplicate} duplicate
                {preview.summary.duplicate === 1 ? "" : "s"}
              </span>
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="size-4 accent-[var(--color-brand)]"
              />
            </label>
          )}

          <PreviewTable preview={preview} />

          {readOnly && (
            <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Demo mode — sign in with Supabase configured to actually import.
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button variant="ghost" onClick={() => setStep("map")} className="gap-1.5">
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button onClick={runCommit} disabled={pending}>
              {pending
                ? "Importing…"
                : `Import ${skipDuplicates ? preview.summary.new : preview.summary.new + preview.summary.duplicate} rows`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4 — done */}
      {step === "done" && result && (
        <div className="mt-5 space-y-4 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-positive/15 text-positive">
            <Check className="size-7" />
          </span>
          <div>
            <p className="font-medium">Import complete</p>
            <p className="text-sm text-muted-foreground">
              Imported {result.imported}, skipped {result.skipped} duplicate
              {result.skipped === 1 ? "" : "s"}
              {result.errors ? `, ${result.errors} error${result.errors === 1 ? "" : "s"}` : ""}.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button variant="secondary" onClick={undo} disabled={pending} className="gap-1.5">
              <Undo2 className="size-4" /> Undo import
            </Button>
            <Button onClick={reset}>Import another</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: Step[] = ["upload", "map", "preview", "done"];
  const labels: Record<Step, string> = {
    upload: "Upload",
    map: "Map",
    preview: "Preview",
    done: "Done",
  };
  const current = steps.indexOf(step);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex flex-1 items-center gap-2">
          <div
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
              i < current
                ? "bg-brand text-brand-foreground"
                : i === current
                  ? "bg-brand/20 text-brand ring-1 ring-brand"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < current ? <Check className="size-3.5" /> : i + 1}
          </div>
          <span
            className={cn(
              "text-xs font-medium",
              i === current ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {labels[s]}
          </span>
          {i < steps.length - 1 && (
            <div className="hidden h-px flex-1 bg-border sm:block" />
          )}
        </div>
      ))}
    </div>
  );
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "warning" | "negative";
}) {
  const color =
    tone === "positive" ? "text-positive" : tone === "warning" ? "text-warning" : "text-negative";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 text-center">
      <div className={cn("text-2xl font-semibold tabular-nums", color)}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function RawPreview({
  headers,
  rows,
  mapping,
}: {
  headers: string[];
  rows: Record<string, string>[];
  mapping: ColumnMapping;
}) {
  const mapped = new Set(Object.values(mapping).filter(Boolean) as string[]);
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            {headers.map((h) => (
              <th
                key={h}
                className={cn(
                  "whitespace-nowrap px-3 py-2 font-medium",
                  mapped.has(h) ? "text-brand" : "text-muted-foreground",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 3).map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {headers.map((h) => (
                <td key={h} className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {r[h]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewTable({ preview }: { preview: ImportPreview }) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {preview.items.slice(0, 100).map((item) => (
            <tr key={item.index} className="border-b border-border last:border-0">
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                {item.canonical?.date ?? "—"}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2">
                {item.canonical?.description ?? item.canonical?.categoryName ?? "—"}
              </td>
              <td
                className={cn(
                  "whitespace-nowrap px-3 py-2 text-right tabular-nums",
                  item.canonical?.kind === "income" && "text-positive",
                )}
              >
                {item.canonical
                  ? `${item.canonical.kind === "income" ? "+" : "−"}${formatCurrency(item.canonical.amount, "USD")}`
                  : "—"}
              </td>
              <td className="px-3 py-2">
                <StatusBadge item={item} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview.items.length > 100 && (
        <div className="px-3 py-2 text-center text-[11px] text-muted-foreground">
          Showing first 100 of {preview.items.length} rows
        </div>
      )}
    </div>
  );
}

function StatusBadge({ item }: { item: ImportPreview["items"][number] }) {
  if (item.status === "new") return <Badge variant="positive">New</Badge>;
  if (item.status === "duplicate")
    return (
      <Badge variant="warning">
        Duplicate{item.dupeOf === "file" ? " (in file)" : ""}
      </Badge>
    );
  return (
    <Badge variant="negative" title={item.reason}>
      Error
    </Badge>
  );
}

function emptyMapping(): ColumnMapping {
  return { date: null, amount: null, description: null, category: null, type: null };
}
