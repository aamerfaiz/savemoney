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

export interface TransactionOption extends NamedOption {
  kind: "income" | "expense";
  date: string;
}

export interface ReferenceData {
  expenseCategories: NamedOption[];
  incomeCategories: NamedOption[];
  accounts: NamedOption[];
  investments: NamedOption[];
  loans: NamedOption[];
  goals: NamedOption[];
  /** Only `open` collections — a closed one has nothing left to log a
   * contribution or payout against. */
  collections: NamedOption[];
  recurringRules: NamedOption[];
  /** Synthetic "label" per row (no real name column on budgets) — see
   * `budgetLabel()`. */
  budgets: NamedOption[];
  /** Always empty as of Phase 3.5.3 — `amount`/`description` are encrypted
   * under the user's vault DEK now, unreadable server-side, so there's no
   * plaintext left here to build a match label from. Editing or deleting a
   * transaction by name through Smart Entry is disabled rather than
   * matching against ciphertext or leaking it into the model's prompt; the
   * capability surfaces "couldn't find that" the same as any unmatched
   * reference. Category/account/investment/loan/goal/recurring/budget
   * matching is unaffected — none of those are encrypted. */
  transactions: TransactionOption[];
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
    { data: collectionRows },
    { data: recurring },
    { data: budgets },
  ] = await Promise.all([
    supabase.from("categories").select("id, name, kind").is("deleted_at", null),
    supabase
      .from("accounts")
      .select("id, name")
      .is("deleted_at", null)
      .eq("is_active", true),
    // No `monthly_contribution` here — encrypted since Phase 3.5.4, same
    // as budgets never had a plaintext amount to build a typicalAmount
    // from.
    supabase.from("investments").select("id, name").is("deleted_at", null),
    // No `emi` here — encrypted since Phase 3.5.4, same reasoning.
    supabase.from("loans").select("id, name").is("deleted_at", null),
    supabase.from("goals").select("id, name").is("deleted_at", null),
    // `title` stays plaintext (like a goal's `name`) — only amounts and
    // contributor names are encrypted, see docs/e2ee-path-b-plan.md.
    supabase
      .from("collections")
      .select("id, title")
      .is("deleted_at", null)
      .eq("status", "open"),
    supabase
      .from("recurring_rules")
      .select("id, name")
      .is("deleted_at", null),
    supabase
      .from("budgets")
      .select("id, category_id, period")
      .is("deleted_at", null),
  ]);

  const cats = (categories ?? []) as { id: string; name: string; kind: string }[];
  const categoryName = (id: string | null) => cats.find((c) => c.id === id)?.name ?? null;

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
    investments: ((investments ?? []) as { id: string; name: string }[]).map((i) => ({
      id: i.id,
      name: i.name,
    })),
    loans: ((loans ?? []) as { id: string; name: string }[]).map((l) => ({
      id: l.id,
      name: l.name,
    })),
    goals: ((goals ?? []) as { id: string; name: string }[]).map((g) => ({
      id: g.id,
      name: g.name,
    })),
    collections: ((collectionRows ?? []) as { id: string; title: string }[]).map((c) => ({
      id: c.id,
      name: c.title,
    })),
    recurringRules: ((recurring ?? []) as { id: string; name: string }[]).map((r) => ({
      id: r.id,
      name: r.name,
    })),
    budgets: (
      (budgets ?? []) as { id: string; category_id: string | null; period: string }[]
    ).map((b) => ({
      id: b.id,
      name: `${categoryName(b.category_id) ?? "Overall"} budget (${b.period})`,
    })),
    transactions: [],
  };
}

/**
 * The current, editable field values for one row — fetched only when a
 * capability's `resolve()` needs to merge a user's requested changes on top
 * of what's already there (edit capabilities never wipe fields the user
 * didn't mention). RLS scopes every read to the caller.
 */
export async function fetchCurrentTransaction(id: string, kind: "income" | "expense") {
  const supabase = await createClient();
  if (kind === "expense") {
    const { data } = await supabase
      .from("expenses")
      .select("amount, spent_at, category_id, account_id, description, note")
      .eq("id", id)
      .single();
    if (!data) return null;
    return {
      kind: "expense" as const,
      amount: Number(data.amount),
      date: data.spent_at as string,
      categoryId: data.category_id as string | null,
      accountId: data.account_id as string | null,
      description: data.description as string | null,
      note: data.note as string | null,
    };
  }
  const { data } = await supabase
    .from("income")
    .select("amount, received_at, category_id, account_id, description, source_type")
    .eq("id", id)
    .single();
  if (!data) return null;
  return {
    kind: "income" as const,
    amount: Number(data.amount),
    date: data.received_at as string,
    categoryId: data.category_id as string | null,
    accountId: data.account_id as string | null,
    description: data.description as string | null,
    sourceType: data.source_type as string,
  };
}

/**
 * Case-insensitive match against the user's own reference rows. Exact match
 * first, then a loose substring match. Returns `null` (never invents or
 * guesses an id) when nothing matches — the caller is responsible for
 * surfacing that as an "unresolved" warning rather than silently picking
 * something.
 */
export function matchByName<T extends NamedOption>(guess: string | null, options: T[]): T | null {
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
