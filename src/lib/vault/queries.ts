import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Whether this account has a vault set up yet, and whether the recovery
 * code was acknowledged — metadata only, never the wrapped keys
 * themselves. Reads through the direct Postgres client (`db`) since the
 * private schema is intentionally invisible to the Supabase/PostgREST
 * client used everywhere else in the app.
 */
export async function getVaultSetupStatus(): Promise<{
  hasVault: boolean;
  recoveryAcknowledged: boolean;
}> {
  if (!db) return { hasVault: false, recoveryAcknowledged: false };
  const userId = await currentUserId();
  if (!userId) return { hasVault: false, recoveryAcknowledged: false };

  const [row] = await db
    .select({ recoveryAcknowledgedAt: schema.vaultKeys.recoveryAcknowledgedAt })
    .from(schema.vaultKeys)
    .where(eq(schema.vaultKeys.userId, userId))
    .limit(1);

  return {
    hasVault: Boolean(row),
    recoveryAcknowledged: Boolean(row?.recoveryAcknowledgedAt),
  };
}

export interface McpTokenMeta {
  id: string;
  label: string;
  scope: "read_summary" | "read_full";
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Non-secret metadata only — never the token, its hash, or its wrap. */
export async function listMcpTokens(): Promise<McpTokenMeta[]> {
  if (!db) return [];
  const userId = await currentUserId();
  if (!userId) return [];

  const rows = await db
    .select({
      id: schema.mcpAgentTokens.id,
      label: schema.mcpAgentTokens.label,
      scope: schema.mcpAgentTokens.scope,
      expiresAt: schema.mcpAgentTokens.expiresAt,
      lastUsedAt: schema.mcpAgentTokens.lastUsedAt,
      revokedAt: schema.mcpAgentTokens.revokedAt,
      createdAt: schema.mcpAgentTokens.createdAt,
    })
    .from(schema.mcpAgentTokens)
    .where(
      and(
        eq(schema.mcpAgentTokens.userId, userId),
        isNull(schema.mcpAgentTokens.deletedAt),
      ),
    )
    .orderBy(desc(schema.mcpAgentTokens.createdAt));

  return rows.map((r) => ({
    ...r,
    expiresAt: r.expiresAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
