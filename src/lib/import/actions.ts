"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { baseCurrencyFor } from "@/lib/profile/queries";
import type { TransactionKind } from "@/lib/transactions/types";
import { buildPreview, dedupeKey, parseDate } from "./pipeline";
import type { ColumnMapping, CommitResult, ImportPreview } from "./types";

const MAX_ROWS = 5000;

interface ImportPayload {
  rows: Record<string, string>[];
  mapping: ColumnMapping;
  defaultKind: TransactionKind;
}

async function requireUser() {
  if (!isSupabaseConfigured()) {
    return { error: "Connect Supabase (set env vars) to import." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };
  return { supabase, userId: user.id };
}

/** Fetch dedupe keys of existing rows within the CSV's date range. */
async function existingKeysInRange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): Promise<Set<string>> {
  const dates = rows
    .map((r) => (mapping.date ? parseDate(r[mapping.date] ?? "") : null))
    .filter((d): d is string => !!d)
    .sort();
  const keys = new Set<string>();
  if (dates.length === 0) return keys;
  const from = dates[0];
  const to = dates[dates.length - 1];

  const [{ data: inc }, { data: exp }] = await Promise.all([
    supabase
      .from("income")
      .select("amount, received_at, description")
      .is("deleted_at", null)
      .gte("received_at", from)
      .lte("received_at", to),
    supabase
      .from("expenses")
      .select("amount, spent_at, description")
      .is("deleted_at", null)
      .gte("spent_at", from)
      .lte("spent_at", to),
  ]);

  for (const r of (inc ?? []) as { amount: number | string; received_at: string; description: string | null }[]) {
    keys.add(dedupeKey({ kind: "income", amount: Number(r.amount), date: r.received_at, description: r.description, categoryName: null }));
  }
  for (const r of (exp ?? []) as { amount: number | string; spent_at: string; description: string | null }[]) {
    keys.add(dedupeKey({ kind: "expense", amount: Number(r.amount), date: r.spent_at, description: r.description, categoryName: null }));
  }
  return keys;
}

/** Normalize + flag duplicates (within file and against the database). */
export async function previewImport(
  payload: ImportPayload,
): Promise<ImportPreview> {
  const rows = payload.rows.slice(0, MAX_ROWS);
  if (!isSupabaseConfigured()) {
    return buildPreview(rows, payload.mapping, payload.defaultKind, new Set());
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const keys = user
    ? await existingKeysInRange(supabase, rows, payload.mapping)
    : new Set<string>();
  return buildPreview(rows, payload.mapping, payload.defaultKind, keys);
}

/** Commit the import: create a batch and insert the (non-duplicate) rows. */
export async function commitImport(
  payload: ImportPayload & { filename: string; skipDuplicates: boolean },
): Promise<CommitResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const currency = await baseCurrencyFor(supabase, userId);

  const rows = payload.rows.slice(0, MAX_ROWS);
  const keys = await existingKeysInRange(supabase, rows, payload.mapping);
  const preview = buildPreview(rows, payload.mapping, payload.defaultKind, keys);

  const toImport = preview.items.filter(
    (i) => i.status === "new" || (i.status === "duplicate" && !payload.skipDuplicates),
  );
  if (toImport.length === 0) {
    return { ok: true, imported: 0, skipped: preview.summary.duplicate, errors: preview.summary.error };
  }

  // Resolve category names → ids (per kind, case-insensitive).
  const { data: cats } = await supabase
    .from("categories")
    .select("id, name, kind")
    .is("deleted_at", null);
  const catMap = new Map<string, string>();
  for (const c of (cats ?? []) as { id: string; name: string; kind: string }[]) {
    catMap.set(`${c.kind}|${c.name.toLowerCase()}`, c.id);
  }

  // Create the batch first so rows can reference it.
  const { data: batch, error: batchErr } = await supabase
    .from("import_batches")
    .insert({
      user_id: userId,
      source: "csv",
      filename: payload.filename,
      total_rows: preview.summary.total,
      duplicate_rows: preview.summary.duplicate,
      imported_rows: 0,
    })
    .select("id")
    .single();
  if (batchErr || !batch) {
    return { ok: false, error: batchErr?.message ?? "Could not create import batch." };
  }

  const incomeRows: Record<string, unknown>[] = [];
  const expenseRows: Record<string, unknown>[] = [];
  for (const item of toImport) {
    const c = item.canonical!;
    const categoryId = c.categoryName
      ? (catMap.get(`${c.kind}|${c.categoryName.toLowerCase()}`) ?? null)
      : null;
    const base = {
      user_id: userId,
      amount: c.amount,
      currency,
      description: c.description,
      category_id: categoryId,
      import_batch_id: batch.id,
    };
    if (c.kind === "income") {
      incomeRows.push({ ...base, received_at: c.date, source_type: "other" });
    } else {
      expenseRows.push({ ...base, spent_at: c.date });
    }
  }

  if (incomeRows.length) {
    const { error } = await supabase.from("income").insert(incomeRows);
    if (error) return { ok: false, error: error.message, batchId: batch.id };
  }
  if (expenseRows.length) {
    const { error } = await supabase.from("expenses").insert(expenseRows);
    if (error) return { ok: false, error: error.message, batchId: batch.id };
  }

  const imported = incomeRows.length + expenseRows.length;
  await supabase
    .from("import_batches")
    .update({ imported_rows: imported })
    .eq("id", batch.id);

  revalidatePath("/import");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return {
    ok: true,
    batchId: batch.id,
    imported,
    skipped: preview.summary.duplicate,
    errors: preview.summary.error,
  };
}

/** Undo an import: soft-delete its rows and mark the batch rolled back. */
export async function rollbackImport(batchId: string): Promise<CommitResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const now = new Date().toISOString();
  const [{ error: incErr }, { error: expErr }] = await Promise.all([
    supabase.from("income").update({ deleted_at: now }).eq("import_batch_id", batchId).is("deleted_at", null),
    supabase.from("expenses").update({ deleted_at: now }).eq("import_batch_id", batchId).is("deleted_at", null),
  ]);
  if (incErr || expErr) {
    return { ok: false, error: (incErr ?? expErr)?.message };
  }

  const { error: batchErr } = await supabase
    .from("import_batches")
    .update({ status: "rolled_back" })
    .eq("id", batchId);
  if (batchErr) return { ok: false, error: batchErr.message };

  revalidatePath("/import");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, batchId };
}
