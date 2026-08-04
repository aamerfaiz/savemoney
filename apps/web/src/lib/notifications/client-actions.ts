"use client";

/**
 * Client-side wrappers that encrypt `body` before calling the real Server
 * Actions (Phase 3.5.4). `title`/`href`/`type`/`severity` stay plaintext —
 * title is app-generated and low sensitivity (see docs/e2ee-path-b-plan.md),
 * and body is the only field carrying user-specific detail (amounts, names).
 */

import { encryptPacked } from "@/lib/vault/crypto";
import {
  markNotificationRead,
  dismissNotification,
  markAllNotificationsRead,
  type ActionResult,
  type NotificationPayload,
} from "./actions";
import type { NotificationItem } from "./types";

async function toEncryptedPayload(
  i: NotificationItem,
  dek: CryptoKey,
): Promise<NotificationPayload> {
  return {
    dedupeKey: i.dedupeKey,
    type: i.type,
    severity: i.severity,
    title: i.title,
    body: await encryptPacked(i.body, dek),
    href: i.href,
  };
}

export async function encryptedMarkNotificationRead(
  dek: CryptoKey,
  i: NotificationItem,
): Promise<ActionResult> {
  return markNotificationRead(await toEncryptedPayload(i, dek));
}

export async function encryptedDismissNotification(
  dek: CryptoKey,
  i: NotificationItem,
): Promise<ActionResult> {
  return dismissNotification(await toEncryptedPayload(i, dek));
}

export async function encryptedMarkAllNotificationsRead(
  dek: CryptoKey,
  items: NotificationItem[],
): Promise<ActionResult> {
  const payloads = await Promise.all(items.map((i) => toEncryptedPayload(i, dek)));
  return markAllNotificationsRead(payloads);
}
