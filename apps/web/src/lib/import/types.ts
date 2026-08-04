import type { TransactionKind } from "@/lib/transactions/types";

/** The canonical fields the pipeline maps CSV columns onto. */
export type ImportField = "date" | "amount" | "description" | "category" | "type";

export type ColumnMapping = Record<ImportField, string | null>;

/** A row after normalization — the shape every importer produces. */
export interface CanonicalRow {
  kind: TransactionKind;
  amount: number; // always positive
  date: string; // YYYY-MM-DD
  description: string | null;
  categoryName: string | null;
}

export type RowStatus = "new" | "duplicate" | "error";

export interface PreviewItem {
  index: number;
  raw: Record<string, string>;
  canonical: CanonicalRow | null;
  status: RowStatus;
  reason?: string;
  dupeOf?: "file" | "existing";
}

export interface ImportSummary {
  total: number;
  new: number;
  duplicate: number;
  error: number;
}

export interface ImportPreview {
  items: PreviewItem[];
  summary: ImportSummary;
}

export interface CommitResult {
  ok: boolean;
  error?: string;
  batchId?: string;
  imported?: number;
  skipped?: number;
  errors?: number;
}
