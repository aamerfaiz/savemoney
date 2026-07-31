"use client";

/**
 * Client-side decryption of raw finance rows (Phase 3.5.3). Fault-tolerant
 * per row on purpose: rows encrypted under a different DEK (or, right now,
 * pre-migration rows that were never encrypted at all — see
 * docs/e2ee-path-b-plan.md 3.5.3) fail to decrypt individually rather than
 * taking down the whole list. Callers get back what could be read plus a
 * count of what couldn't, so the UI can say so instead of going blank.
 */

import { decryptPacked } from "@/lib/vault/crypto";
import type { RawIncomeRow, RawExpenseRow } from "./raw-data";

export interface DecryptedIncomeRow {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  accountId: string | null;
  accountName: string | null;
  receivedAt: string;
  isRecurring: boolean;
  frequency: string;
  sourceType: string | null;
}

export interface DecryptedExpenseRow {
  id: string;
  amount: number;
  currency: string;
  description: string | null;
  note: string | null;
  tags: string[] | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountId: string | null;
  accountName: string | null;
  spentAt: string;
  isRecurring: boolean;
  frequency: string;
}

export interface DecryptResult<T> {
  rows: T[];
  failedCount: number;
}

export async function decryptIncomeRows(
  rows: RawIncomeRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedIncomeRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedIncomeRow> => ({
      ...r,
      amount: Number(await decryptPacked(r.amount, dek)),
      description: r.description ? await decryptPacked(r.description, dek) : null,
    })),
  );
  return splitSettled(settled);
}

export async function decryptExpenseRows(
  rows: RawExpenseRow[],
  dek: CryptoKey,
): Promise<DecryptResult<DecryptedExpenseRow>> {
  const settled = await Promise.allSettled(
    rows.map(async (r): Promise<DecryptedExpenseRow> => {
      const tagsJson = r.tags ? await decryptPacked(r.tags, dek) : null;
      return {
        ...r,
        amount: Number(await decryptPacked(r.amount, dek)),
        description: r.description ? await decryptPacked(r.description, dek) : null,
        note: r.note ? await decryptPacked(r.note, dek) : null,
        tags: tagsJson ? (JSON.parse(tagsJson) as string[]) : null,
      };
    }),
  );
  return splitSettled(settled);
}

function splitSettled<T>(settled: PromiseSettledResult<T>[]): DecryptResult<T> {
  const rows: T[] = [];
  let failedCount = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") rows.push(s.value);
    else failedCount++;
  }
  return { rows, failedCount };
}
