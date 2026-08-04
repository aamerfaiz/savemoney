import type { TransactionKind } from "@/lib/transactions/types";
import type {
  CanonicalRow,
  ColumnMapping,
  ImportField,
  ImportPreview,
  PreviewItem,
} from "./types";

/*
  The shared import pipeline. CSV is the first consumer; SMS/email/bank feeds
  will produce the same `Record<string,string>[]` raw rows and reuse
  normalizeRow + buildPreview + dedupeKey. Pure — no I/O — so it runs on the
  server (with DB dedupe) or the client (instant within-file preview).
*/

const HEADER_HINTS: Record<ImportField, string[]> = {
  date: ["date", "posted", "transaction date", "time", "when"],
  amount: ["amount", "value", "debit", "credit", "total", "sum", "price"],
  description: ["description", "details", "memo", "narration", "name", "payee", "note", "particulars"],
  category: ["category", "tag", "type of expense", "class"],
  type: ["type", "kind", "direction", "dr/cr", "debit/credit"],
};

/** Guess which CSV column maps to each canonical field from header names. */
export function detectMapping(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const pick = (field: ImportField): string | null => {
    for (const hint of HEADER_HINTS[field]) {
      const i = lower.findIndex((h) => h === hint);
      if (i >= 0) return headers[i];
    }
    for (const hint of HEADER_HINTS[field]) {
      const i = lower.findIndex((h) => h.includes(hint));
      if (i >= 0) return headers[i];
    }
    return null;
  };
  return {
    date: pick("date"),
    amount: pick("amount"),
    description: pick("description"),
    category: pick("category"),
    type: pick("type"),
  };
}

const INCOME_WORDS = ["income", "credit", "cr", "deposit", "in", "salary", "received"];
const EXPENSE_WORDS = ["expense", "debit", "dr", "withdrawal", "out", "payment", "spent", "paid"];

/** Parse a messy money string ("$1,234.50", "(50.00)", "-20") into a number. */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.includes("-")) negative = true;
  s = s.replace(/[^0-9.]/g, "");
  if (s === "" || s === ".") return null;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

/** Parse ISO, US (MM/DD/YYYY) and DD/MM/YYYY-ish dates → YYYY-MM-DD. */
export function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const a = m[1];
    const b = m[2];
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    // Prefer MM/DD when the first field can't be a month>12; otherwise DD/MM.
    let month = Number(a);
    let day = Number(b);
    if (month > 12 && day <= 12) [month, day] = [day, month];
    const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return isValidISO(iso) ? iso : null;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

function isValidISO(iso: string): boolean {
  const d = new Date(iso + "T00:00:00");
  return !Number.isNaN(d.getTime()) && iso === d.toISOString().slice(0, 10);
}

export interface NormalizeResult {
  canonical?: CanonicalRow;
  error?: string;
}

/** Turn one raw CSV record into a canonical row (or an error). */
export function normalizeRow(
  raw: Record<string, string>,
  mapping: ColumnMapping,
  defaultKind: TransactionKind,
): NormalizeResult {
  const dateRaw = mapping.date ? raw[mapping.date] : "";
  const amountRaw = mapping.amount ? raw[mapping.amount] : "";

  const date = parseDate(dateRaw ?? "");
  if (!date) return { error: `Unrecognized date "${dateRaw ?? ""}"` };

  const amountSigned = parseAmount(amountRaw ?? "");
  if (amountSigned == null || amountSigned === 0) {
    return { error: `Unrecognized amount "${amountRaw ?? ""}"` };
  }

  let kind: TransactionKind;
  const typeRaw = mapping.type ? (raw[mapping.type] ?? "").trim().toLowerCase() : "";
  if (typeRaw && INCOME_WORDS.some((w) => typeRaw === w || typeRaw.includes(w))) {
    kind = "income";
  } else if (typeRaw && EXPENSE_WORDS.some((w) => typeRaw === w || typeRaw.includes(w))) {
    kind = "expense";
  } else if (amountSigned < 0) {
    kind = "expense";
  } else {
    kind = defaultKind;
  }

  const description = mapping.description
    ? (raw[mapping.description] ?? "").trim() || null
    : null;
  const categoryName = mapping.category
    ? (raw[mapping.category] ?? "").trim() || null
    : null;

  return {
    canonical: {
      kind,
      amount: Math.abs(amountSigned),
      date,
      description,
      categoryName,
    },
  };
}

/** Natural identity of a transaction — used for duplicate detection. */
export function dedupeKey(c: CanonicalRow): string {
  return `${c.kind}|${c.amount.toFixed(2)}|${c.date}|${(c.description ?? "").toLowerCase().trim()}`;
}

/**
 * Normalize every row, then flag duplicates both within the file and against
 * `existingKeys` (dedupe keys already in the database).
 */
export function buildPreview(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  defaultKind: TransactionKind,
  existingKeys: Set<string>,
): ImportPreview {
  const seen = new Set<string>();
  const items: PreviewItem[] = rows.map((raw, index) => {
    const { canonical, error } = normalizeRow(raw, mapping, defaultKind);
    if (error || !canonical) {
      return { index, raw, canonical: null, status: "error", reason: error };
    }
    const key = dedupeKey(canonical);
    if (existingKeys.has(key)) {
      return { index, raw, canonical, status: "duplicate", dupeOf: "existing" };
    }
    if (seen.has(key)) {
      return { index, raw, canonical, status: "duplicate", dupeOf: "file" };
    }
    seen.add(key);
    return { index, raw, canonical, status: "new" };
  });

  const summary = {
    total: items.length,
    new: items.filter((i) => i.status === "new").length,
    duplicate: items.filter((i) => i.status === "duplicate").length,
    error: items.filter((i) => i.status === "error").length,
  };
  return { items, summary };
}
