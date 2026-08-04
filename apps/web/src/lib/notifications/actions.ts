"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/supabase/require-user";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const payloadSchema = z.object({
  dedupeKey: z.string().min(1).max(200),
  type: z.string().max(40),
  severity: z.string().max(20),
  title: z.string().max(200),
  // Packed ciphertext (iv:base64 + base64 ciphertext) runs well past the
  // plaintext's own length — see src/lib/notifications/client-actions.ts.
  body: z.string().max(4000).optional().nullable(),
  href: z.string().max(200).optional().nullable(),
});

export type NotificationPayload = z.infer<typeof payloadSchema>;

type SupabaseServer = SupabaseClient;

/**
 * Persist state for a derived alert. Because alerts are generated live, the
 * first mark/dismiss creates the backing row (carrying its content), keyed by
 * dedupe_key; later ones update it. No unique constraint, so read-then-write.
 */
async function upsertState(
  supabase: SupabaseServer,
  userId: string,
  payload: NotificationPayload,
  patch: { is_read?: boolean; is_dismissed?: boolean },
): Promise<ActionResult> {
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("dedupe_key", payload.dedupeKey)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  const readAt = patch.is_read ? new Date().toISOString() : undefined;

  if (existing?.id) {
    const { error } = await supabase
      .from("notifications")
      .update({ ...patch, ...(readAt ? { read_at: readAt } : {}) })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("notifications").insert({
      user_id: userId,
      type: payload.type,
      severity: payload.severity,
      title: payload.title,
      body: payload.body ?? null,
      href: payload.href ?? null,
      dedupe_key: payload.dedupeKey,
      is_read: patch.is_read ?? false,
      is_dismissed: patch.is_dismissed ?? false,
      read_at: readAt ?? null,
    });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function markNotificationRead(
  raw: NotificationPayload,
): Promise<ActionResult> {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid notification." };

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };

  const res = await upsertState(auth.supabase, auth.userId, parsed.data, {
    is_read: true,
  });
  revalidatePath("/notifications");
  return res;
}

export async function dismissNotification(
  raw: NotificationPayload,
): Promise<ActionResult> {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid notification." };

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };

  const res = await upsertState(auth.supabase, auth.userId, parsed.data, {
    is_read: true,
    is_dismissed: true,
  });
  revalidatePath("/notifications");
  return res;
}

/** dedupeKey -> persisted read/dismiss flags, for client-side composition
 * (Phase 3.5.3 — notifications now assembles alongside client-computed
 * budgets, so the whole page moved client-side; see src/lib/notifications/
 * compute.ts). */
export async function fetchNotificationStateAction(): Promise<
  Record<string, { read: boolean; dismissed: boolean }>
> {
  const auth = await requireUser();
  if ("error" in auth) return {};

  const { data } = await auth.supabase
    .from("notifications")
    .select("dedupe_key, is_read, is_dismissed")
    .is("deleted_at", null)
    .not("dedupe_key", "is", null);

  const state: Record<string, { read: boolean; dismissed: boolean }> = {};
  for (const r of (data ?? []) as {
    dedupe_key: string;
    is_read: boolean;
    is_dismissed: boolean;
  }[]) {
    state[r.dedupe_key] = { read: r.is_read, dismissed: r.is_dismissed };
  }
  return state;
}

export async function markAllNotificationsRead(
  payloads: NotificationPayload[],
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };

  for (const raw of payloads) {
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) continue;
    const res = await upsertState(auth.supabase, auth.userId, parsed.data, {
      is_read: true,
    });
    if (!res.ok) return res;
  }
  revalidatePath("/notifications");
  return { ok: true };
}
