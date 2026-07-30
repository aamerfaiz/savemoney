/** Cookie marking an active guest session. Readable by client + server (no httpOnly) — the
 *  guest data itself never touches a cookie, only this on/off flag does. */
export const GUEST_COOKIE = "fos_guest";
