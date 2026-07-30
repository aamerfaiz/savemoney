import { GUEST_COOKIE } from "./constants";
import { ensureGuestSeeded } from "./repo";
import { clearGuestDb } from "./db";

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Client-side read of the guest cookie (server-side call sites read it via next/headers directly). */
export function isGuestCookieSet(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((c) => c === `${GUEST_COOKIE}=1` || c.startsWith(`${GUEST_COOKIE}=1;`));
}

/**
 * Marks this browser as a guest session and seeds IndexedDB on first use.
 * `useSampleData` controls whether that seed is demo data or a blank slate.
 */
export async function enterGuestMode(useSampleData = true): Promise<void> {
  document.cookie = `${GUEST_COOKIE}=1; path=/; max-age=${MAX_AGE}; samesite=lax`;
  await ensureGuestSeeded(useSampleData);
}

/** Clears the guest cookie and wipes all locally-stored guest data. */
export async function exitGuestMode(): Promise<void> {
  document.cookie = `${GUEST_COOKIE}=; path=/; max-age=0; samesite=lax`;
  await clearGuestDb();
}
