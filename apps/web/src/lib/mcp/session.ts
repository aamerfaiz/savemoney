import "server-only";

/**
 * MCP token verification (Phase 3.5.9). Turns a raw bearer token into a
 * transient, request-scoped session: `userId` (for RLS-equivalent scoping
 * on every subsequent query — every tool must filter by this explicitly,
 * same discipline as vault/rotation-actions.ts), `dek` (unwrapped for
 * this request only), and what the token is allowed to do (`scope`,
 * `canWrite`). Every query here goes through the direct Postgres client
 * (`db`) since `private.mcp_agent_tokens` is invisible to PostgREST by
 * design — there is no Supabase session on an MCP call at all, the token
 * itself is the entire credential.
 */

import { and, count, eq, gte } from "drizzle-orm";

import { db, schema } from "@/db";
import { decodeMcpToken, hashTokenBytes, unwrapDekFromToken } from "./server-crypto";
import { MCP_RATE_LIMIT_PER_MINUTE } from "./constants";

export interface McpSession {
  tokenId: string;
  userId: string;
  scope: "read_summary" | "read_full";
  canWrite: boolean;
  dek: CryptoKey;
}

export type McpSessionResult = { ok: true; session: McpSession } | { ok: false; error: string };

/** Verifies a bearer token end to end: decodes it, looks it up by hash,
 * checks revocation/expiry, unwraps its DEK, and stamps `lastUsedAt`.
 * Never throws on a bad/garbage token — every failure mode (malformed,
 * unknown, revoked, expired, wrong DEK) returns a normal `{ok:false}`
 * result, since this runs on every single tool call against an
 * unauthenticated, arbitrary bearer string from the network. */
export async function resolveMcpSession(rawToken: string | null): Promise<McpSessionResult> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };
  if (!rawToken || !rawToken.trim()) return { ok: false, error: "Missing bearer token." };

  try {
    const tokenBytes = decodeMcpToken(rawToken.trim());
    const tokenHash = await hashTokenBytes(tokenBytes);

    const [row] = await db
      .select()
      .from(schema.mcpAgentTokens)
      .where(eq(schema.mcpAgentTokens.tokenHash, tokenHash))
      .limit(1);
    if (!row) return { ok: false, error: "Invalid token." };
    if (row.revokedAt) return { ok: false, error: "This token has been revoked." };
    if (row.expiresAt.getTime() <= Date.now()) return { ok: false, error: "This token has expired." };

    const dek = await unwrapDekFromToken(
      tokenBytes,
      row.tokenKekSalt,
      { ciphertext: row.wrappedDekByToken, iv: row.tokenDekIv },
    );

    await db
      .update(schema.mcpAgentTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.mcpAgentTokens.id, row.id));

    return {
      ok: true,
      session: {
        tokenId: row.id,
        userId: row.userId,
        scope: row.scope,
        canWrite: row.canWrite,
        dek,
      },
    };
  } catch {
    // Malformed token, or a wrap that fails to unwrap (wrong key material
    // reached via a corrupted/garbage token string) — never distinguish
    // these from "invalid token" in the response; the failure mode isn't
    // useful to an attacker and isn't different in consequence to a
    // legitimate caller either way.
    return { ok: false, error: "Invalid token." };
  }
}

/** Returns `true` if this token is still under the rate limit, `false` if
 * it should be rejected. Counts recent rows in `mcp_tool_call_log`
 * instead of an in-memory counter, which wouldn't be shared across
 * Vercel's independent serverless instances anyway. */
export async function checkRateLimit(tokenId: string): Promise<boolean> {
  if (!db) return true;
  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const [row] = await db
    .select({ n: count() })
    .from(schema.mcpToolCallLog)
    .where(
      and(eq(schema.mcpToolCallLog.tokenId, tokenId), gte(schema.mcpToolCallLog.createdAt, oneMinuteAgo)),
    );
  return (row?.n ?? 0) < MCP_RATE_LIMIT_PER_MINUTE;
}

/** Records that a tool was called — never what it saw or changed, see
 * schema.ts's doc comment on `mcpToolCallLog`. Best-effort: a logging
 * failure must never break the actual tool call, so this swallows its
 * own errors. */
export async function logToolCall(entry: {
  tokenId: string;
  userId: string;
  toolName: string;
  action: "read" | "propose" | "write";
  targetTable?: string;
  targetId?: string;
}): Promise<void> {
  if (!db) return;
  try {
    await db.insert(schema.mcpToolCallLog).values({
      tokenId: entry.tokenId,
      userId: entry.userId,
      toolName: entry.toolName,
      action: entry.action,
      targetTable: entry.targetTable ?? null,
      targetId: entry.targetId ?? null,
    });
  } catch {
    // best-effort — never let audit logging fail the actual tool call
  }
}
