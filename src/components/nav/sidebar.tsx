"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { navItems, visibleNavItems } from "./nav-config";

/** Desktop sidebar (lg+). */
export function Sidebar({ isGuest = false }: { isGuest?: boolean }) {
  const pathname = usePathname();
  const items = visibleNavItems(navItems, isGuest);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/40 lg:flex">
      <div className="flex h-16 items-center gap-2 px-6">
        <span className="flex size-8 items-center justify-center rounded-md bg-brand text-brand-foreground font-semibold shadow-[0_0_20px_-4px_var(--color-brand)]">
          F
        </span>
        <span className="text-lg font-semibold tracking-tight">Finance OS</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Primary">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand/15 text-brand"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4 text-xs text-muted-foreground">
        Finance OS · Phase 1
      </div>
    </aside>
  );
}
