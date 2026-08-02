import "server-only";

import { and, eq, isNull, or } from "drizzle-orm";

import { db, schema } from "@/db";
import type { McpSession } from "../session";

/** Every MCP tool response must include the JSON as a `content[].text`
 * TextContent block, never `structuredContent`-only — Claude Code/Desktop
 * read only `content[].text` and can drop `structuredContent`, Cursor
 * does the reverse (see docs/e2ee-path-b-plan.md "Resolved: MCP agent
 * access", the cross-client compatibility note). This is the one place
 * every tool funnels its final response through, so that rule can't be
 * accidentally skipped by a new tool. */
export function toolResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data && typeof data === "object" ? (data as Record<string, unknown>) : undefined,
    isError,
  };
}

export function toolError(message: string) {
  return toolResult({ error: message }, true);
}

/** Every write tool's first line of defense: a token that can't write
 * shouldn't even reach the confirm-gate. Write also requires `read_full`
 * — a token that can't read real amounts has no sane way to show a
 * meaningful confirmation preview either. */
export function requireWriteAccess(session: McpSession): string | null {
  if (!session.canWrite) {
    return "This token doesn't have write access. Mint or edit a token in Settings → Agent Access with \"Allow write access\" turned on.";
  }
  if (session.scope !== "read_full") {
    return "Write actions require a \"Full data\" scope token, not \"Summary only\" — the agent needs to read real amounts to act on them.";
  }
  return null;
}

export interface NamedRow {
  id: string;
  name: string;
}

/** Case-insensitive match against the caller's own rows: exact first,
 * then substring. Returns `null` rather than guessing — callers surface
 * that as "couldn't find X named ...", never silently picking the wrong
 * row. Mirrors src/lib/ai/capabilities/shared.ts's `matchByName`
 * (Smart Entry), reimplemented here since that module isn't reachable
 * from an MCP tool call (different auth boundary, no Supabase session). */
export function matchByName<T extends NamedRow>(guess: string | null | undefined, options: T[]): T | null {
  if (!guess) return null;
  const norm = guess.trim().toLowerCase();
  if (!norm) return null;
  const exact = options.find((o) => o.name.toLowerCase() === norm);
  if (exact) return exact;
  return (
    options.find((o) => o.name.toLowerCase().includes(norm) || norm.includes(o.name.toLowerCase())) ?? null
  );
}

/** Category id -> name/kind, scoped to the caller plus shared/seeded
 * system categories (`userId IS NULL`) — small table, cheap to load in
 * full rather than joining per read-tool query. */
export async function loadCategoryMap(userId: string) {
  if (!db) return new Map<string, { name: string; kind: string }>();
  const rows = await db
    .select({ id: schema.categories.id, name: schema.categories.name, kind: schema.categories.kind })
    .from(schema.categories)
    .where(
      and(
        or(eq(schema.categories.userId, userId), isNull(schema.categories.userId)),
        isNull(schema.categories.deletedAt),
      ),
    );
  return new Map(rows.map((r) => [r.id, { name: r.name, kind: r.kind }]));
}

/** `profile/queries.ts`'s `baseCurrencyFor` relies on the Supabase session
 * client (cookies) — unusable here, there's no session on an MCP call.
 * Same query, via `db` instead. */
export async function getBaseCurrency(userId: string): Promise<string> {
  if (!db) return "USD";
  const [row] = await db
    .select({ baseCurrency: schema.profiles.baseCurrency })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, userId))
    .limit(1);
  return row?.baseCurrency ?? "USD";
}

export async function loadAccountMap(userId: string) {
  if (!db) return new Map<string, string>();
  const rows = await db
    .select({ id: schema.accounts.id, name: schema.accounts.name })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), isNull(schema.accounts.deletedAt)));
  return new Map(rows.map((r) => [r.id, r.name]));
}
