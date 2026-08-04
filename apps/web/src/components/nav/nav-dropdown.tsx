"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Shared small anchored panel for the top bar's Notifications/Add dropdowns
 * (the Search command palette is a full-screen modal instead — see
 * command-palette.tsx). Portaled to `document.body` like mobile-nav.tsx's
 * drawer, for the same reason: the header's `backdrop-blur` is a
 * `backdrop-filter` ancestor that would otherwise trap `position: fixed`.
 * Pinned to a fixed top-right slot under the header rather than computed
 * off the trigger's exact position — the header is a constant 64px (`h-16`)
 * tall and both callers live in its right-side button cluster, so this
 * avoids a positioning dependency for a fixed, small set of call sites.
 */
export function NavDropdown({
  open,
  onClose,
  anchorRef,
  align = "end",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  align?: "start" | "end";
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      className={cn(
        "fixed right-4 z-[80] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card shadow-2xl animate-[navDropdownIn_0.15s_ease]",
        align === "start" && "left-4 right-auto",
        className,
      )}
      style={{ top: "calc(4rem + env(safe-area-inset-top))" }}
    >
      {children}
      <style>{`@keyframes navDropdownIn { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }`}</style>
    </div>,
    document.body,
  );
}
