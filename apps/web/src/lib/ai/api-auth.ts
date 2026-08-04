import "server-only";

import { requireUser } from "@/lib/supabase/require-user";

export type ApiAuthResult = { ok: true; userId: string } | { ok: false; error: string };

/**
 * Auth gate for the `/api/v1/ai/*` Route Handlers.
 *
 * Previously cookie-only — see docs/mobile-build-phase-plan.md §2 blocker
 * #2/#3 and §5 step 3 for the full history. That gap is closed as of
 * Phase 5.3: `requireUser()` (`@/lib/supabase/require-user`) now resolves
 * either an `Authorization: Bearer <supabase-access-token>` header (a
 * mobile client's own Supabase session, minted via PKCE — Phase 5.4) or
 * the existing cookie session, and every query/action these handlers call
 * through (`loadReferenceData`, `createTransaction`, etc.) already goes
 * through that same shared helper instead of instantiating its own
 * cookie-bound client — so a bearer-token request now carries all the way
 * through the stack, not just this gate.
 */
export async function requireApiUser(): Promise<ApiAuthResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };
  return { ok: true, userId: auth.userId };
}
