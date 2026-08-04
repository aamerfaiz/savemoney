import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { GUEST_ALLOWED_PATHS, GUEST_COOKIE } from "@/lib/guest/constants";

/** Routes that never require an authenticated session. `/api/mcp` does its
 * own auth entirely (a bearer token, checked in the route handler itself
 * via mcp/session.ts's `resolveMcpSession`) — external MCP clients (Claude
 * Desktop, Cursor, ...) have no Supabase session cookie at all, so gating
 * this route on one would make it unreachable from outside a browser.
 *
 * `/api/v1` is the same story for the mobile app (Phase 5.3 — see
 * docs/mobile-build-phase-plan.md §2 blocker #2/#3, §5 step 3): every
 * route under it resolves auth itself via `requireUser()`/
 * `requireApiUser()`, which accepts either a cookie session or an
 * `Authorization: Bearer` header. A mobile client sending only a bearer
 * token has no session cookie at all — without this exemption, this
 * proxy would redirect it to `/login` (an HTML redirect, not a JSON 401)
 * before the request ever reached the route handler's own auth check,
 * silently defeating bearer-token auth entirely. Each route still
 * enforces auth on its own; this only stops the proxy from pre-empting
 * that with a cookie-only gate. */
const PUBLIC_PATHS = ["/login", "/auth", "/_next", "/favicon", "/manifest", "/api/mcp", "/api/v1"];

/**
 * Refreshes the Supabase auth session on every request and guards the app.
 * Unauthenticated users hitting a protected route are sent to /login — there
 * is no demo/unauthenticated fallback, guest mode or a real session are the
 * only ways in.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  // A guest session runs entirely client-side against IndexedDB — no
  // Supabase user to check. But only the routes with real guest-mode support
  // read from IndexedDB; every other (app) route assumes a real session and
  // errors for guests, so bounce those to the dashboard instead of crashing.
  if (request.cookies.get(GUEST_COOKIE)?.value === "1") {
    const isGuestAllowed = GUEST_ALLOWED_PATHS.some(
      (p) => path === p || path.startsWith(p + "/"),
    );
    if (isPublic || isGuestAllowed) return supabaseResponse;
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    // Not configured: real sign-in is impossible, so only public routes
    // (and guest mode, handled above) are reachable.
    if (isPublic) return supabaseResponse;
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
