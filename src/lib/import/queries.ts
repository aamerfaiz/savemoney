import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface ImportBatchSummary {
  id: string;
  filename: string | null;
  source: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  status: "completed" | "rolled_back";
  createdAt: string;
}

/** Recent import batches, newest first. Empty in demo mode. */
export async function getImportHistory(): Promise<ImportBatchSummary[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("import_batches")
    .select("id, filename, source, total_rows, imported_rows, duplicate_rows, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  return ((data ?? []) as ImportBatchRow[]).map((b) => ({
    id: b.id,
    filename: b.filename,
    source: b.source,
    totalRows: b.total_rows,
    importedRows: b.imported_rows,
    duplicateRows: b.duplicate_rows,
    status: b.status as "completed" | "rolled_back",
    createdAt: b.created_at,
  }));
}

interface ImportBatchRow {
  id: string;
  filename: string | null;
  source: string;
  total_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  status: string;
  created_at: string;
}
