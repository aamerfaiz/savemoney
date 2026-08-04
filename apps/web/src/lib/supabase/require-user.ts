import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createClient } from "./server";

export { createBearerClient } from "./server";

/**
 * Phase 5.3 — generalizes the bearer-token pattern that
 * `ai/api-auth.ts`'s `requireApiUser` (and its doc comment) originally
 * flagged as unfinished: every module's `actions.ts` had its own copy of
 * this exact "get the caller's userId" logic, hard-wired to the cookie
 * session, so a bearer-token request (the mobile app's own Supabase
 * session, not the separate MCP agent-token scheme in lib/mcp/) would
 * pass a Route Handler's auth gate and then fail deeper in the stack with
 * no session.
 *
 * `./server`'s `createClient()` now resolves the bearer-vs-cookie choice
 * itself (see its doc comment) — this is just that plus `auth.getUser()`,
 * for the many actions.ts/queries.ts functions that need the caller's
 * `userId` (not just an RLS-scoped client trusted to self-filter).
 *
 * Deliberately unrelated to `lib/mcp/session.ts`'s `resolveMcpSession` —
 * that's a separate, opaque per-agent token scheme (external tools like
 * Claude Desktop) with no Supabase session or RLS at all, scoped by
 * manual `userId` filtering instead. This helper is for the user's own
 * primary session, on any client (web cookie or mobile bearer token).
 */

export type RequireUserResult =
  | { userId: string; supabase: SupabaseClient; user: User }
  | { error: string };

/** The one place every module's actions.ts/queries.ts resolves "who is
 * calling, and what Supabase client should the rest of this request use."
 * Never throws — every failure mode (missing session, invalid/expired
 * bearer token, a `getUser()` network hiccup) returns a normal
 * `{error}` result, since this runs on every mutation and read. */
export async function requireUser(): Promise<RequireUserResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You need to sign in first." };
    return { supabase, userId: user.id, user };
  } catch {
    return { error: "Couldn't verify your session. Try again." };
  }
}
