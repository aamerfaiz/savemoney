"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { navItems, visibleNavItems } from "./nav-config";

/**
 * Mobile-only nav. The top-left logo opens a slide-in drawer with the FULL nav
 * (including the items that don't fit the 5-slot bottom bar — Loans, Import,
 * Settings). Hidden on lg+ where the sidebar covers everything.
 */
export function MobileNav({ isGuest = false }: { isGuest?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = visibleNavItems(navItems, isGuest);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex items-center gap-1 lg:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex size-8 items-center justify-center rounded-md text-foreground transition-opacity active:opacity-70"
      >
        <Menu className="size-5" />
      </button>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md transition-opacity active:opacity-70"
      >
        <span className="flex size-8 items-center justify-center rounded-md bg-brand text-brand-foreground font-semibold">
          F
        </span>
        <span className="text-base font-semibold tracking-tight">Finance OS</span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          // Portaled to <body> so the drawer escapes the header's
          // backdrop-filter, which would otherwise trap position:fixed.
          <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease]"
            onClick={() => setOpen(false)}
          />
          <aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col border-r border-border bg-card animate-[slideIn_0.2s_ease]"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex h-16 items-center justify-between px-5">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-md bg-brand text-brand-foreground font-semibold">
                  F
                </span>
                <span className="text-lg font-semibold tracking-tight">
                  Finance OS
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="All pages">
              {items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand/15 text-brand"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="size-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-border p-4 text-xs text-muted-foreground">
              Finance OS · Phase 1
            </div>
          </aside>
          <style>{`
            @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes slideIn { from { transform: translateX(-100%) } to { transform: translateX(0) } }
          `}</style>
          </div>,
          document.body,
        )}
    </div>
  );
}
