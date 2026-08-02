import { MobileNav } from "./mobile-nav";
import { ExitGuestButton } from "./exit-guest-button";
import { LogoutButton } from "./logout-button";
import { CommandPalette } from "./command-palette";
import { McpNotificationsBell } from "./mcp-notifications-bell";
import { AddShortcutsMenu } from "./add-shortcuts-menu";

/** App header. On mobile the logo opens the full nav; on desktop the sidebar does. */
export function TopBar({
  userName,
  isGuest = false,
}: {
  userName: string;
  isGuest?: boolean;
}) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-lg lg:px-8">
      <MobileNav isGuest={isGuest} />

      <div className="hidden flex-col lg:flex">
        <span className="text-xs text-muted-foreground">{greeting},</span>
        <span className="text-sm font-semibold">
          {userName}
          {isGuest && (
            <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
              Guest
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        {isGuest ? (
          <ExitGuestButton />
        ) : (
          <>
            <CommandPalette />
            <McpNotificationsBell />
            <AddShortcutsMenu />
            <LogoutButton />
          </>
        )}
      </div>
    </header>
  );
}
