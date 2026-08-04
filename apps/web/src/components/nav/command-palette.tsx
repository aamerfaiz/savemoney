"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, Plus, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { navItems, visibleNavItems } from "./nav-config";
import { visibleAddShortcuts } from "./add-shortcuts";

interface PaletteItem {
  id: string;
  label: string;
  sublabel: string;
  href: string;
  icon: LucideIcon;
  kind: "page" | "action";
  /** Extra terms a query can match beyond the label itself — the "smart"
   * part of "smart search": typing "emi" finds the Bill Calendar, "health"
   * finds the Financial Score, etc. */
  keywords: string[];
}

/** Per-item search synonyms. Keyed by href so it stays next to nothing
 * else — small enough not to warrant its own file. */
const KEYWORDS: Record<string, string[]> = {
  "/transactions": ["income", "expense", "spending"],
  "/budget": ["safe to spend", "spending limit"],
  "/loans": ["emi", "debt"],
  "/net-worth": ["assets", "liabilities"],
  "/calendar": ["bills", "due dates", "emi"],
  "/financial-score": ["health score", "health"],
  "/import": ["csv", "bank statement"],
  "/ai": ["assistant", "smart entry", "chat"],
};

function buildItems(isGuest: boolean): PaletteItem[] {
  const pages: PaletteItem[] = visibleNavItems(navItems, isGuest).map((n) => ({
    id: `page:${n.href}`,
    label: n.label,
    sublabel: "Page",
    href: n.href,
    icon: n.icon,
    kind: "page",
    keywords: KEYWORDS[n.href] ?? [],
  }));

  const actions: PaletteItem[] = visibleAddShortcuts(isGuest).map((s) => ({
    id: `add:${s.href}`,
    label: `New ${s.label.toLowerCase()}`,
    sublabel: "Quick add",
    href: `${s.href}?new=1`,
    icon: Plus,
    kind: "action",
    keywords: [s.label.toLowerCase(), "add", "create"],
  }));

  return [...pages, ...actions];
}

function matches(item: PaletteItem, q: string): boolean {
  if (item.label.toLowerCase().includes(q)) return true;
  return item.keywords.some((k) => k.includes(q));
}

/** Top bar Search button — a Cmd/Ctrl+K command palette over every page and
 * quick-add action. "Smart" in the limited sense that matches aren't just
 * the visible label: a small per-item keyword list (see KEYWORDS) covers
 * the vocabulary someone would actually type ("emi", "health", "csv")
 * rather than the nav label itself. */
export function CommandPalette({ isGuest = false }: { isGuest?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const allItems = useMemo(() => buildItems(isGuest), [isGuest]);
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return allItems.slice(0, 8);
    return allItems.filter((i) => matches(i, q)).slice(0, 8);
  }, [allItems, q]);

  // Reset the highlighted result to the top whenever the query changes —
  // adjusted during render (React's documented pattern for this) rather
  // than in an effect, which would cause an extra render pass.
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    setActiveIndex(0);
  }

  function openPalette() {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  function activate(item: PaletteItem) {
    setOpen(false);
    router.push(item.href);
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Global Cmd/Ctrl+K, from anywhere — skipped while typing in another
  // field so it doesn't hijack normal text entry.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !typing) {
        e.preventDefault();
        openPalette();
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) activate(item);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={openPalette}
        aria-label="Search"
        className="hidden h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-foreground transition-colors hover:bg-muted/70 sm:inline-flex"
      >
        <Search className="size-4" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm animate-[fadeIn_0.15s_ease]"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
            >
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Search pages and actions…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
                  Esc
                </kbd>
              </div>

              {results.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Nothing matches &ldquo;{query}&rdquo;.
                </p>
              ) : (
                <ul className="max-h-80 overflow-y-auto py-1.5">
                  {results.map((item, i) => (
                    <li key={item.id}>
                      <button
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => activate(item)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                          i === activeIndex ? "bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-md",
                            item.kind === "action"
                              ? "bg-brand/15 text-brand"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          <item.icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {item.sublabel}
                        </span>
                        {i === activeIndex && (
                          <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
          </div>,
          document.body,
        )}
    </>
  );
}
