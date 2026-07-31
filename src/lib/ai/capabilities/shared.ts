import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface NamedOption {
  id: string;
  name: string;
  /** A representative recurring amount (monthly SIP, EMI, monthly goal
   * contribution) used only for the soft anomaly check — never for
   * validation. */
  typicalAmount?: number;
}

export interface ReferenceData {
  expenseCategories: NamedOption[];
  incomeCategories: NamedOption[];
  accounts: NamedOption[];
  investments: NamedOption[];
  loans: NamedOption[];
  goals: NamedOption[];
}

/**
 * Every reference set a capability might need to resolve a name against,
 * loaded once per request. Every query goes through the RLS-scoped Supabase
 * client, so this can only ever return the signed-in user's own rows —
 * there is no path here for one user's prompt to resolve against another
 * user's data.
 */
export async function loadReferenceData(): Promise<ReferenceData> {
  const supabase = await createClient();

  const [
    { data: categories },
    { data: accounts },
    { data: investments },
    { data: loans },
    { data: goals },
  ] = await Promise.all([
    supabase.from("categories").select("id, name, kind").is("deleted_at", null),
    supabase
      .from("accounts")
      .select("id, name")
      .is("deleted_at", null)
      .eq("is_active", true),
    supabase
      .from("investments")
      .select("id, name, monthly_contribution")
      .is("deleted_at", null),
    supabase.from("loans").select("id, name, emi").is("deleted_at", null),
    supabase
      .from("goals")
      .select("id, name, monthly_contribution")
      .is("deleted_at", null),
  ]);

  const cats = (categories ?? []) as { id: string; name: string; kind: string }[];

  return {
    expenseCategories: cats
      .filter((c) => c.kind === "expense")
      .map((c) => ({ id: c.id, name: c.name })),
    incomeCategories: cats
      .filter((c) => c.kind === "income")
      .map((c) => ({ id: c.id, name: c.name })),
    accounts: ((accounts ?? []) as { id: string; name: string }[]).map((a) => ({
      id: a.id,
      name: a.name,
    })),
    investments: (
      (investments ?? []) as {
        id: string;
        name: string;
        monthly_contribution: string | number | null;
      }[]
    ).map((i) => ({
      id: i.id,
      name: i.name,
      typicalAmount:
        i.monthly_contribution == null ? undefined : Number(i.monthly_contribution),
    })),
    loans: (
      (loans ?? []) as { id: string; name: string; emi: string | number }[]
    ).map((l) => ({ id: l.id, name: l.name, typicalAmount: Number(l.emi) })),
    goals: (
      (goals ?? []) as {
        id: string;
        name: string;
        monthly_contribution: string | number | null;
      }[]
    ).map((g) => ({
      id: g.id,
      name: g.name,
      typicalAmount:
        g.monthly_contribution == null ? undefined : Number(g.monthly_contribution),
    })),
  };
}

/**
 * Case-insensitive match against the user's own reference rows. Exact match
 * first, then a loose substring match. Returns `null` (never invents or
 * guesses an id) when nothing matches — the caller is responsible for
 * surfacing that as an "unresolved" warning rather than silently picking
 * something.
 */
export function matchByName(
  guess: string | null,
  options: NamedOption[],
): NamedOption | null {
  if (!guess) return null;
  const norm = guess.trim().toLowerCase();
  if (!norm) return null;

  const exact = options.find((o) => o.name.toLowerCase() === norm);
  if (exact) return exact;

  const partial = options.find(
    (o) =>
      o.name.toLowerCase().includes(norm) || norm.includes(o.name.toLowerCase()),
  );
  return partial ?? null;
}

/**
 * Bridges a validated, plain object into the `FormData` shape every
 * module's existing Server Action already expects — this is what lets Smart
 * Entry reuse those actions verbatim as the single write path instead of a
 * second, parallel insert path.
 */
export function toFormData(fields: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    fd.set(key, typeof value === "boolean" ? String(value) : String(value));
  }
  return fd;
}
