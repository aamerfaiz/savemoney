import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ApiAuthResult = { ok: true; userId: string } | { ok: false; error: string };

/**
 * Auth gate for the `/api/v1/ai/*` Route Handlers. Cookie-based session
 * only, today — the same mechanism every Server Action in the app already
 * uses via `requireUser()`.
 *
 * NOTE on the mobile-forward design in docs/ai-smart-entry-plan.md: these
 * routes are Route Handlers (not Server Actions) specifically so a future
 * Expo client can call them too, but true bearer-token auth needs more than
 * this file — every query/action these handlers call through
 * (`loadReferenceData`, `createTransaction`, etc.) instantiates its own
 * cookie-bound Supabase client internally via `@/lib/supabase/server`, so a
 * bearer-token request would pass this gate and then fail deeper in the
 * stack with no session. Wiring bearer-token support end-to-end requires
 * threading an injected Supabase client through that whole query/action
 * layer first — a Phase 5 prerequisite, tracked in the plan doc, not done
 * here. Shipping a bearer-token check at just this layer would be a false
 * sense of mobile-readiness, not real support.
 */
export async function requireApiUser(): Promise<ApiAuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to sign in first." };
  return { ok: true, userId: user.id };
}
