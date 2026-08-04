"use client";

import { useEffect, useState } from "react";

/**
 * Reads `?new=1` (set by the top bar's Add dropdown / command palette) so a
 * module page can auto-open its own "add" dialog on arrival instead of
 * landing on the plain list. Reads `window.location` directly rather than
 * `useSearchParams()` — this only needs to run once, client-side, after
 * mount, so it isn't worth opting the whole page into the Suspense
 * boundary `useSearchParams()` requires. Strips the param right after so a
 * refresh or back-navigation doesn't reopen the dialog.
 *
 * Each `*-view.tsx` already owns its own `adding` dialog state — this only
 * supplies that state's initial value: `useState(useAutoOpenAdd())`.
 */
export function useAutoOpenAdd(): boolean {
  const [shouldOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("new") === "1";
  });

  useEffect(() => {
    if (!shouldOpen) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [shouldOpen]);

  return shouldOpen;
}
