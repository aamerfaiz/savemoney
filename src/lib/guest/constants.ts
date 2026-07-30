/** Cookie marking an active guest session. Readable by client + server (no httpOnly) — the
 *  guest data itself never touches a cookie, only this on/off flag does. */
export const GUEST_COOKIE = "fos_guest";

/**
 * Routes with real guest-mode support (client-side IndexedDB data, see
 * src/lib/guest/). Every other (app) route reads through the real Supabase
 * client and assumes a signed-in user — proxy.ts redirects guests away from
 * them (src/lib/supabase/middleware.ts) and the nav hides them (see
 * src/components/nav/nav-config.ts's `isGuestVisible`) so there's no
 * dead-end link. Extend this list only alongside adding real guest data
 * support for that module.
 */
export const GUEST_ALLOWED_PATHS = ["/dashboard", "/transactions"];
