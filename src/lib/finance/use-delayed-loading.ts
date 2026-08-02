"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Debounces a loading flag so the decrypt-progress UI (Phase 3.5.10) never
 * flashes on-screen for a load that finishes in a couple frames (a small
 * account decrypts near-instantly), and — once it does show — stays up
 * long enough to actually read rather than jump-cutting to 100% and
 * vanishing.
 */
export function useDelayedLoading(
  isLoading: boolean,
  { showAfter = 200, minVisible = 400 }: { showAfter?: number; minVisible?: number } = {},
): boolean {
  const [show, setShow] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      const t = setTimeout(() => {
        shownAt.current = Date.now();
        setShow(true);
      }, showAfter);
      return () => clearTimeout(t);
    }

    if (show) {
      const elapsed = shownAt.current ? Date.now() - shownAt.current : minVisible;
      const t = setTimeout(() => setShow(false), Math.max(0, minVisible - elapsed));
      return () => clearTimeout(t);
    }
    // isLoading is false and we never showed anything — nothing to do.
  }, [isLoading, showAfter, minVisible, show]);

  return show;
}
