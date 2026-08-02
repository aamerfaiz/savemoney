"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Bot } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NavDropdown } from "./nav-dropdown";
import { fetchMcpActivity, type McpActivityItem } from "@/lib/mcp/activity";
import { useCurrentUserId } from "@/lib/vault/use-current-user-id";

const CURSOR_PREFIX = "finos-mcp-notif-seen-at:";

function readCursor(userId: string): number {
  try {
    return Number(localStorage.getItem(CURSOR_PREFIX + userId) ?? 0);
  } catch {
    return 0;
  }
}

function writeCursor(userId: string, at: number) {
  try {
    localStorage.setItem(CURSOR_PREFIX + userId, String(at));
  } catch {
    // Storage unavailable (private browsing, etc.) — the bell just won't
    // remember what's been seen across reloads. Not worth surfacing.
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

/**
 * Top bar notification bell — surfaces recent MCP agent activity (Claude
 * Desktop/Code, Cursor, etc. writing through /api/mcp) via
 * `fetchMcpActivity`. Deliberately not real-time: a plain on-demand read,
 * polled on an interval instead of subscribed to. "Read" is a client-side
 * cursor (localStorage, scoped per user) rather than a per-row flag on the
 * server — opening the dropdown advances it past everything currently
 * shown, so already-seen activity simply doesn't come back next time.
 */
export function McpNotificationsBell({ isGuest = false }: { isGuest?: boolean }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  // What the panel shows while open — captured at the moment it's opened,
  // separately from `items`/cursor, so marking things read (which happens
  // in the same click) doesn't also hide them before they've been seen.
  const [visibleItems, setVisibleItems] = useState<McpActivityItem[]>([]);
  const userIdQuery = useCurrentUserId();
  const userId = userIdQuery.data;

  const activityQuery = useQuery({
    queryKey: ["mcp-activity"],
    queryFn: () => fetchMcpActivity(),
    enabled: !isGuest && !!userId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const items = activityQuery.data ?? [];
  const effectiveCursor = cursor || (userId ? readCursor(userId) : 0);
  const unread = items.filter((i) => new Date(i.createdAt).getTime() > effectiveCursor);

  function toggle() {
    const next = !open;
    if (next) {
      setVisibleItems(unread);
      if (userId && unread.length > 0) {
        // Opening it IS reading it — advance the cursor immediately rather
        // than waiting for an explicit per-item "mark read" action. Read
        // from `unread`, not `items`, so it can never mark something the
        // panel isn't about to show.
        const latest = Math.max(...unread.map((i) => new Date(i.createdAt).getTime()));
        writeCursor(userId, latest);
        setCursor(latest);
      }
    }
    setOpen(next);
  }

  if (isGuest) return null;

  return (
    <>
      <Button
        ref={buttonRef}
        variant="secondary"
        size="icon"
        aria-label="Notifications"
        aria-expanded={open}
        className="relative"
        onClick={toggle}
      >
        <Bell />
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-brand-foreground">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </Button>

      <NavDropdown open={open} onClose={() => setOpen(false)} anchorRef={buttonRef}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Agent activity</span>
          <span className="text-[11px] text-muted-foreground">via MCP</span>
        </div>

        {visibleItems.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            {items.length === 0
              ? "No agent activity yet. Connect an AI agent in Settings → Agent Access to see writes here."
              : "You're all caught up."}
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {visibleItems.map((item: McpActivityItem) => (
              <li key={item.id} className="flex items-start gap-2.5 px-4 py-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                  <Bot className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {relativeTime(item.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </NavDropdown>
    </>
  );
}
