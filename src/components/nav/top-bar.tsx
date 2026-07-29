import { Bell, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";

/** App header. On mobile the logo opens the full nav; on desktop the sidebar does. */
export function TopBar({ userName }: { userName: string }) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-lg lg:px-8">
      <MobileNav />

      <div className="hidden flex-col lg:flex">
        <span className="text-xs text-muted-foreground">{greeting},</span>
        <span className="text-sm font-semibold">{userName}</span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Search"
          className="hidden sm:inline-flex"
        >
          <Search />
        </Button>
        <Button variant="secondary" size="icon" aria-label="Notifications">
          <Bell />
        </Button>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Add</span>
        </Button>
      </div>
    </header>
  );
}
