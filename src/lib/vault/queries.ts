import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Whether this account has a vault set up yet, whether the recovery code
 * was acknowledged, and whether the account has no email/password identity
 * at all (Google-only sign-in) — metadata only, never the wrapped keys
 * themselves. Reads through the direct Postgres client (`db`) since the
 * private schema is intentionally invisible to the Supabase/PostgREST
 * client used everywhere else in the app. `isOAuthOnly` drives the 3.5.6
 * first-touch "Set up your Vault Passphrase" prompt copy — OAuth-only
 * accounts have never typed a password into this app before, so the vault
 * passphrase needs framing as their first one, not "another password."
 */
export async function getVaultSetupStatus(): Promise<{
  hasVault: boolean;
  recoveryAcknowledged: boolean;
  isOAuthOnly: boolean;
}> {
  const user = await currentUser();
  if (!user) return { hasVault: false, recoveryAcknowledged: false, isOAuthOnly: false };

  const isOAuthOnly = !(user.identities ?? []).some((i) => i.provider === "email");

  if (!db) return { hasVault: false, recoveryAcknowledged: false, isOAuthOnly };

  const [row] = await db
    .select({ recoveryAcknowledgedAt: schema.vaultKeys.recoveryAcknowledgedAt })
    .from(schema.vaultKeys)
    .where(eq(schema.vaultKeys.userId, user.id))
    .limit(1);

  return {
    hasVault: Boolean(row),
    recoveryAcknowledged: Boolean(row?.recoveryAcknowledgedAt),
    isOAuthOnly,
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
  const userId = (await currentUser())?.id;
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
