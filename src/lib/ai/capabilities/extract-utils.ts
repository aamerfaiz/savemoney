import "server-only";

/** Small, dependency-free coercions shared by every capability's `resolve()`.
 * Never throws — a bad guess from the model just becomes `null`/omitted so
 * the real Zod schema (not this file) is what ultimately accepts or rejects
 * a value. */

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.-]/g, "");
    if (cleaned === "" || cleaned === "-") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

export function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeDate(v: unknown): string | null {
  const s = asString(v);
  return s && DATE_RE.test(s) ? s : null;
}

/** Match a free-text guess against a closed enum — the model can only ever
 * land on a value that already exists in `allowed`; anything else comes back
 * `null` and the caller omits the field so the schema's own default applies. */
export function normalizeEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
): T | null {
  const s = asString(v)?.toLowerCase();
  if (!s) return null;
  const exact = allowed.find((a) => a.toLowerCase() === s);
  if (exact) return exact;
  const partial = allowed.find(
    (a) => s.includes(a.toLowerCase()) || a.toLowerCase().includes(s),
  );
  return partial ?? null;
}
