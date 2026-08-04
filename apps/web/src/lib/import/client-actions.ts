"use client";

/**
 * Client-side preview + commit orchestration for CSV import (Phase 3.5.3).
 * The pure pipeline functions (buildPreview, dedupeKey, parseDate —
 * src/lib/import/pipeline.ts) are unchanged; what moved is *where* they run
 * and what they compare against: dedupe used to run server-side against
 * plaintext DB rows, now the client fetches ciphertext, decrypts, and runs
 * the same pure functions itself. Encryption-on-commit follows the same
 * pattern as src/lib/transactions/client-actions.ts.
 */

import { decryptPacked, encryptPacked } from "@/lib/vault/crypto";
import { fetchExistingImportRows, commitImport, type EncryptedImportItem } from "./actions";
import { buildPreview, dedupeKey, parseDate } from "./pipeline";
import type { CanonicalRow, ColumnMapping, CommitResult, ImportPreview } from "./types";
import type { TransactionKind } from "@/lib/transactions/types";

export async function previewImportClientSide(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  defaultKind: TransactionKind,
  dek: CryptoKey,
): Promise<ImportPreview | { error: string }> {
  const dates = rows
    .map((r) => (mapping.date ? parseDate(r[mapping.date] ?? "") : null))
    .filter((d): d is string => !!d)
    .sort();

  const keys = new Set<string>();
  if (dates.length > 0) {
    const existing = await fetchExistingImportRows(dates[0], dates[dates.length - 1]);
    if ("error" in existing) return { error: existing.error };

    for (const r of existing) {
      let description: string | null = null;
      let amount: number;
      try {
        amount = Number(await decryptPacked(r.amount, dek));
        description = r.description ? await decryptPacked(r.description, dek) : null;
      } catch {
        // Undecryptable (pre-3.5.3 row, or a different vault) — can't be
        // meaningfully deduped against; skip rather than false-match.
        continue;
      }
      const canonical: CanonicalRow = {
        kind: r.kind,
        amount,
        date: r.date,
        description,
        categoryName: null,
      };
      keys.add(dedupeKey(canonical));
    }
  }

  return buildPreview(rows, mapping, defaultKind, keys);
}

export async function commitImportClientSide(
  preview: ImportPreview,
  filename: string,
  skipDuplicates: boolean,
  dek: CryptoKey,
): Promise<CommitResult> {
  const toImport = preview.items.filter(
    (i) => i.status === "new" || (i.status === "duplicate" && !skipDuplicates),
  );
  if (toImport.length === 0) {
    return {
      ok: true,
      imported: 0,
      skipped: preview.summary.duplicate,
      errors: preview.summary.error,
    };
  }

  const items: EncryptedImportItem[] = await Promise.all(
    toImport.map(async (item): Promise<EncryptedImportItem> => {
      const c = item.canonical!;
      return {
        kind: c.kind,
        amount: await encryptPacked(String(c.amount), dek),
        description: c.description ? await encryptPacked(c.description, dek) : null,
        date: c.date,
        categoryName: c.categoryName,
      };
    }),
  );

  const result = await commitImport({ items, filename });
  if (!result.ok) return result;
  return {
    ...result,
    skipped: preview.summary.duplicate,
    errors: preview.summary.error,
  };
}
