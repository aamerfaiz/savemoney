"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/supabase/require-user";
import { baseCurrencyFor } from "@/lib/profile/queries";
import type { TransactionKind } from "@/lib/transactions/types";
import type { CommitResult } from "./types";

const MAX_ROWS = 5000;

export interface RawImportRow {
  kind: TransactionKind;
  amount: string; // packed ciphertext
  description: string | null; // packed ciphertext or null
  date: string;
}

/**
 * Existing income/expense rows (ciphertext) in a date range, for the client
 * to decrypt and dedupe against — Phase 3.5.3. The server can no longer
 * compute dedupe keys itself (that needs plaintext amount/description), so
 * previewImport's old server-side dedupe pass moved entirely client-side;
 * see src/lib/import/client-actions.ts. Pipeline functions themselves
 * (buildPreview, dedupeKey — src/lib/import/pipeline.ts) are unchanged and
 * still pure, just called from the browser now instead of here.
 */
export async function fetchExistingImportRows(
  fromISO: string,
  toISO: string,
): Promise<RawImportRow[] | { error: string }> {
  const auth = await requireUser();
  if ("error" in auth) return { error: auth.error ?? "You need to sign in first." };
  const { supabase } = auth;

  const [{ data: inc }, { data: exp }] = await Promise.all([
    supabase
      .from("income")
      .select("amount, received_at, description")
      .is("deleted_at", null)
      .gte("received_at", fromISO)
      .lte("received_at", toISO),
    supabase
      .from("expenses")
      .select("amount, spent_at, description")
      .is("deleted_at", null)
      .gte("spent_at", fromISO)
      .lte("spent_at", toISO),
  ]);

  const rows: RawImportRow[] = [];
  for (const r of (inc ?? []) as { amount: string; received_at: string; description: string | null }[]) {
    rows.push({ kind: "income", amount: r.amount, description: r.description, date: r.received_at });
  }
  for (const r of (exp ?? []) as { amount: string; spent_at: string; description: string | null }[]) {
    rows.push({ kind: "expense", amount: r.amount, description: r.description, date: r.spent_at });
  }
  return rows;
}

export interface EncryptedImportItem {
  kind: TransactionKind;
  /** Packed ciphertext — encrypted client-side before this call. */
  amount: string;
  description: string | null;
  date: string;
  categoryName: string | null;
}

/** Commit the import: create a batch and insert the (already-encrypted,
 * already-deduped-client-side) rows. The server can't re-run dedupe against
 * ciphertext, so it trusts the client's preview — the same trust boundary
 * every encrypted-write action now has (see docs/e2ee-path-b-plan.md). */
export async function commitImport(payload: {
  items: EncryptedImportItem[];
  filename: string;
}): Promise<CommitResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, userId } = auth;
  const currency = await baseCurrencyFor(supabase, userId);

  const items = payload.items.slice(0, MAX_ROWS);
  if (items.length === 0) {
    return { ok: true, imported: 0, skipped: 0, errors: 0 };
  }

  const { data: cats } = await supabase
    .from("categories")
    .select("id, name, kind")
    .is("deleted_at", null);
  const catMap = new Map<string, string>();
  for (const c of (cats ?? []) as { id: string; name: string; kind: string }[]) {
    catMap.set(`${c.kind}|${c.name.toLowerCase()}`, c.id);
  }

  const { data: batch, error: batchErr } = await supabase
    .from("import_batches")
    .insert({
      user_id: userId,
      source: "csv",
      filename: payload.filename,
      total_rows: items.length,
      duplicate_rows: 0,
      imported_rows: 0,
    })
    .select("id")
    .single();
  if (batchErr || !batch) {
    return { ok: false, error: batchErr?.message ?? "Could not create import batch." };
  }

  const incomeRows: Record<string, unknown>[] = [];
  const expenseRows: Record<string, unknown>[] = [];
  for (const item of items) {
    const categoryId = item.categoryName
      ? (catMap.get(`${item.kind}|${item.categoryName.toLowerCase()}`) ?? null)
      : null;
    const base = {
      user_id: userId,
      amount: item.amount,
      currency,
      description: item.description,
      category_id: categoryId,
      import_batch_id: batch.id,
    };
    if (item.kind === "income") {
      incomeRows.push({ ...base, received_at: item.date, source_type: "other" });
    } else {
      expenseRows.push({ ...base, spent_at: item.date });
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
  await supabase.from("import_batches").update({ imported_rows: imported }).eq("id", batch.id);

  revalidatePath("/import");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, batchId: batch.id, imported, skipped: 0, errors: 0 };
}

/** Undo an import: soft-delete its rows and mark the batch rolled back.
 * Untouched by encryption — no encrypted field involved. */
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
