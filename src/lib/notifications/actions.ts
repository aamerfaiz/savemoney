"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const payloadSchema = z.object({
  dedupeKey: z.string().min(1).max(200),
  type: z.string().max(40),
  severity: z.string().max(20),
  title: z.string().max(200),
  body: z.string().max(500).optional().nullable(),
  href: z.string().max(200).optional().nullable(),
});

export type NotificationPayload = z.infer<typeof payloadSchema>;

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

async function requireUser() {
  if (!isSupabaseConfigured()) {
    return { error: "Connect Supabase (set env vars) to sync notifications." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };
  return { supabase, userId: user.id };
}

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
