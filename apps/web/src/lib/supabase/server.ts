import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";

/** Builds a Supabase client scoped to an already-issued access token
 * instead of a cookie session — every PostgREST request carries this
 * token's `Authorization` header, so RLS evaluates it exactly like a
 * cookie-based session's JWT. Never persists or refreshes: the caller
 * (a mobile app) owns the token's lifecycle, this is a one-request use. */
export function createBearerClient(accessToken: string): SupabaseClient {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

async function bearerTokenFromRequest(): Promise<string | null> {
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization");
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match ? match[1] : null;
}

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Phase 5.3 (see docs/mobile-build-phase-plan.md §2 blocker #2/#3, §5 step
 * 3): checks for an `Authorization: Bearer <supabase-access-token>` header
 * first — a mobile client passing its own Supabase Auth session (minted
 * via PKCE, Phase 5.4) — and if present, returns a token-scoped client via
 * `createBearerClient` instead of the cookie-bound one below. Every
 * existing caller that just does `const supabase = await createClient()`
 * and trusts RLS to scope its `.from(...)` queries (most of this app's
 * queries.ts files) gets bearer-token support for free from this one
 * change — no per-module edits needed. Falls back to the cookie session
 * exactly as before when there's no bearer header, which is every
 * existing web request (browsers never send this custom header on a
 * normal same-origin call) — byte-for-byte unchanged behavior there.
 */
export async function createClient() {
  const bearerToken = await bearerTokenFromRequest();
  if (bearerToken) return createBearerClient(bearerToken);

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore, the
            // middleware refreshes the session cookie instead.
          }
        },
      },
    },
  );
}
