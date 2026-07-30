import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { GUEST_COOKIE } from "@/lib/guest/constants";

/** Routes that never require an authenticated session. */
const PUBLIC_PATHS = ["/login", "/auth", "/_next", "/favicon", "/manifest"];

/**
 * Refreshes the Supabase auth session on every request and guards the app.
 * Unauthenticated users hitting a protected route are sent to /login.
 *
 * NOTE: auth guarding is disabled until Supabase env vars are configured, so
 * the dashboard shell renders during local development without credentials.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // A guest session runs entirely client-side against IndexedDB — no
  // Supabase user to check, but the cookie alone is enough to pass the guard.
  if (request.cookies.get(GUEST_COOKIE)?.value === "1") return supabaseResponse;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return supabaseResponse; // not configured yet

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

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
