import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { requireUser } from "@/lib/supabase/require-user";
import type { AIProviderId } from "./types";

export interface ProviderKeyMeta {
  id: string;
  provider: AIProviderId;
  label: string | null;
  model: string | null;
  keyLast4: string;
  isActive: boolean;
  createdAt: string;
}

async function currentUserId(): Promise<string | null> {
  const auth = await requireUser();
  return "error" in auth ? null : auth.userId;
}

/**
 * Metadata only — provider, model, masked last-4, active flag. Never the
 * encrypted key or IV. Reads through the direct Postgres client (`db`) since
 * the private schema this table lives in is intentionally invisible to the
 * Supabase/PostgREST client used everywhere else in the app.
 */
export async function listProviderKeys(): Promise<ProviderKeyMeta[]> {
  if (!db) return [];
  const userId = await currentUserId();
  if (!userId) return [];

  const rows = await db
    .select({
      id: schema.aiProviderKeys.id,
      provider: schema.aiProviderKeys.provider,
      label: schema.aiProviderKeys.label,
      model: schema.aiProviderKeys.model,
      keyLast4: schema.aiProviderKeys.keyLast4,
      isActive: schema.aiProviderKeys.isActive,
      createdAt: schema.aiProviderKeys.createdAt,
    })
    .from(schema.aiProviderKeys)
    .where(
      and(
        eq(schema.aiProviderKeys.userId, userId),
        isNull(schema.aiProviderKeys.deletedAt),
      ),
    )
    .orderBy(desc(schema.aiProviderKeys.createdAt));

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function hasActiveProviderKey(): Promise<boolean> {
  const keys = await listProviderKeys();
  return keys.some((k) => k.isActive);
}
