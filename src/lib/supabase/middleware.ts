import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { GUEST_COOKIE } from "@/lib/guest/constants";

/** Routes that never require an authenticated session. */
const PUBLIC_PATHS = ["/login", "/auth", "/_next", "/favicon", "/manifest"];

/**
 * Refreshes the Supabase auth session on every request and guards the app.
 * Unauthenticated users hitting a protected route are sent to /login — there
 * is no demo/unauthenticated fallback, guest mode or a real session are the
 * only ways in.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // A guest session runs entirely client-side against IndexedDB — no
  // Supabase user to check, but the cookie alone is enough to pass the guard.
  if (request.cookies.get(GUEST_COOKIE)?.value === "1") return supabaseResponse;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

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
