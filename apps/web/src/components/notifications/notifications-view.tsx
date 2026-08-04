"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarClock,
  Wallet,
  AlertTriangle,
  Target,
  Landmark,
  Info,
  Check,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@savemoney/finance-engine/format";
import {
  encryptedMarkNotificationRead,
  encryptedDismissNotification,
  encryptedMarkAllNotificationsRead,
} from "@/lib/notifications/client-actions";
import type { NotificationsData } from "@/lib/notifications/compute";
import type {
  NotificationItem,
  NotificationType,
} from "@/lib/notifications/types";

const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  bill_due: CalendarClock,
  budget_overspend: Wallet,
  low_safe_to_spend: AlertTriangle,
  goal_milestone: Target,
  loan_paid_off: Landmark,
  general: Info,
};

const SEVERITY_TONE = {
  warning: "text-warning",
  info: "text-info",
  positive: "text-positive",
} as const;

export function NotificationsView({
  data,
  dek,
}: {
  data: NotificationsData;
  dek: CryptoKey;
}) {
  const [, startTransition] = useTransition();
  const [items, setItems] = useState<NotificationItem[]>(data.items);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const unread = items.filter((i) => !i.isRead).length;
  const visible = useMemo(
    () => (filter === "unread" ? items.filter((i) => !i.isRead) : items),
    [items, filter],
  );

  const markRead = (i: NotificationItem) => {
    if (i.isRead) return;
    setItems((prev) =>
      prev.map((n) => (n.dedupeKey === i.dedupeKey ? { ...n, isRead: true } : n)),
    );
    startTransition(() => void encryptedMarkNotificationRead(dek, i));
  };

  const dismiss = (i: NotificationItem) => {
    setItems((prev) => prev.filter((n) => n.dedupeKey !== i.dedupeKey));
    startTransition(() => void encryptedDismissNotification(dek, i));
  };

  const markAll = () => {
    const unreadItems = items.filter((i) => !i.isRead);
    if (unreadItems.length === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    startTransition(() => void encryptedMarkAllNotificationsRead(dek, unreadItems));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "You're all caught up"}
          </p>
        </div>
        {unread > 0 && (
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={markAll}>
            <Check className="size-4" /> Mark all read
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-[7px] py-2 text-sm font-medium capitalize transition-colors",
              filter === f
                ? "bg-brand/20 text-brand"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f}
            {f === "unread" && unread > 0 ? ` (${unread})` : ""}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <Bell className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {filter === "unread" ? "No unread notifications." : "Nothing to show."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((i) => (
            <NotificationRow
              key={i.dedupeKey}
              item={i}
              onRead={() => markRead(i)}
              onDismiss={() => dismiss(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onRead,
  onDismiss,
}: {
  item: NotificationItem;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const TypeIcon = TYPE_ICON[item.type];
  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-lg border border-border p-4 transition-colors",
        item.isRead ? "bg-card" : "bg-brand/[0.04]",
      )}
    >
      {!item.isRead && (
        <span className="absolute left-1.5 top-1.5 size-1.5 rounded-full bg-brand" />
      )}
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md bg-muted",
          SEVERITY_TONE[item.severity],
        )}
      >
        <TypeIcon className="size-4" />
      </span>
      <Link
        href={item.href}
        onClick={onRead}
        className="min-w-0 flex-1"
      >
        <div
          className={cn(
            "text-sm",
            item.isRead ? "font-medium" : "font-semibold",
          )}
        >
          {item.title}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {formatDateShort(item.date)}
        </div>
      </Link>
      <div className="flex items-center gap-0.5">
        {!item.isRead && (
          <button
            onClick={onRead}
            aria-label="Mark read"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Check className="size-4" />
          </button>
        )}
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-negative/15 hover:text-negative"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
