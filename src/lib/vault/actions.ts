"use server";

/**
 * Vault Server Actions (Phase 3.5, E2EE "not even me" — see
 * docs/e2ee-path-b-plan.md). Every input here is already ciphertext, a
 * salt, KDF params, or a token hash — computed client-side by
 * src/lib/vault/crypto.ts before this file ever sees it. There is
 * deliberately no action here that returns or accepts a plaintext vault
 * secret, an unwrapped DEK, or a raw MCP token.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { MCP_TOKEN_MAX_DURATION_DAYS } from "./constants";
import { getVaultSetupStatus } from "./queries";
import { kdfParamsSchema, wrappedPayloadSchema } from "./schemas";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireUser() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You need to sign in first." } as const;
    return { userId: user.id } as const;
  } catch {
    return { error: "Couldn't verify your session. Try again." } as const;
  }
}

/** Client-callable wrapper around `getVaultSetupStatus` (Phase 3.5.6) — the
 * gate every encrypted-module page uses to tell "no vault yet, show setup"
 * apart from "vault exists, just locked this session" apart from "OAuth-only
 * account, tailor the copy." Metadata only, same as the query it wraps. */
export async function fetchVaultStatus() {
  return getVaultSetupStatus();
}

/* ----------------------------------------------------------------------- */
/* Vault setup & rotation                                                   */
/* ----------------------------------------------------------------------- */

const setupVaultInputSchema = z.object({
  passwordWrap: wrappedPayloadSchema,
  passwordSalt: z.string().min(1),
  passwordKdfParams: kdfParamsSchema,
  recoveryWrap: wrappedPayloadSchema,
  recoverySalt: z.string().min(1),
});
export type SetupVaultInput = z.infer<typeof setupVaultInputSchema>;

/** First-time vault setup. The UI only calls this after the user has seen
 * the recovery code and confirmed (checkbox) they saved it — by the time
 * this runs, that confirmation is a fact, so `recoveryAcknowledgedAt` is
 * stamped immediately rather than needing a second round trip. */
export async function setupVault(input: SetupVaultInput): Promise<ActionResult> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };

  const parsed = setupVaultInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };

  const [existing] = await db
    .select({ id: schema.vaultKeys.id })
    .from(schema.vaultKeys)
    .where(eq(schema.vaultKeys.userId, auth.userId))
    .limit(1);
  if (existing) {
    return { ok: false, error: "A vault is already set up for this account." };
  }

  await db.insert(schema.vaultKeys).values({
    userId: auth.userId,
    wrappedDekByPassword: parsed.data.passwordWrap.ciphertext,
    passwordDekIv: parsed.data.passwordWrap.iv,
    passwordKekSalt: parsed.data.passwordSalt,
    passwordKdfParams: parsed.data.passwordKdfParams,
    wrappedDekByRecovery: parsed.data.recoveryWrap.ciphertext,
    recoveryDekIv: parsed.data.recoveryWrap.iv,
    recoveryKekSalt: parsed.data.recoverySalt,
    recoveryAcknowledgedAt: new Date(),
  });

  revalidatePath("/settings");
  return { ok: true };
}

/** Returns the wrapped blobs + params needed to unlock, or `hasVault: false`
 * if no vault has been set up yet for this account. Still just ciphertext —
 * the client does the actual unwrapping. */
export async function getVaultBlob() {
  if (!db) return { error: "Database isn't configured in this environment." } as const;
  const auth = await requireUser();
  if ("error" in auth) return { error: auth.error } as const;

  const [row] = await db
    .select()
    .from(schema.vaultKeys)
    .where(eq(schema.vaultKeys.userId, auth.userId))
    .limit(1);
  if (!row) return { hasVault: false } as const;

  return {
    hasVault: true,
    passwordWrap: { ciphertext: row.wrappedDekByPassword, iv: row.passwordDekIv },
    passwordSalt: row.passwordKekSalt,
    passwordKdfParams: row.passwordKdfParams,
    recoveryWrap: { ciphertext: row.wrappedDekByRecovery, iv: row.recoveryDekIv },
    recoverySalt: row.recoveryKekSalt,
  } as const;
}

const rotateVaultSecretInputSchema = z.object({
  path: z.enum(["password", "recovery"]),
  wrap: wrappedPayloadSchema,
  salt: z.string().min(1),
  kdfParams: kdfParamsSchema.optional(),
});
export type RotateVaultSecretInput = z.infer<typeof rotateVaultSecretInputSchema>;

/** Re-wraps the DEK under a newly-derived KEK for one unlock path (a plain
 * passphrase change, or re-issuing the recovery code). The DEK itself, and
 * every row it protects, is untouched — only the wrap changes. This is
 * NOT the remedy for a lost quick-unlock device; that needs a full vault
 * rotation (new DEK, re-encrypt everything), which 3.5.6 covers. */
export async function rotateVaultSecret(
  input: RotateVaultSecretInput,
): Promise<ActionResult> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };

  const parsed = rotateVaultSecretInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };

  const values =
    parsed.data.path === "password"
      ? {
          wrappedDekByPassword: parsed.data.wrap.ciphertext,
          passwordDekIv: parsed.data.wrap.iv,
          passwordKekSalt: parsed.data.salt,
          ...(parsed.data.kdfParams ? { passwordKdfParams: parsed.data.kdfParams } : {}),
        }
      : {
          wrappedDekByRecovery: parsed.data.wrap.ciphertext,
          recoveryDekIv: parsed.data.wrap.iv,
          recoveryKekSalt: parsed.data.salt,
        };

  await db
    .update(schema.vaultKeys)
    .set(values)
    .where(eq(schema.vaultKeys.userId, auth.userId));

  revalidatePath("/settings");
  return { ok: true };
}

/* ----------------------------------------------------------------------- */
/* MCP agent tokens — a third, independently revocable DEK unlock path per */
/* connected agent. See docs/e2ee-path-b-plan.md "Resolved: MCP agent      */
/* access."                                                                */
/* ----------------------------------------------------------------------- */

const mintMcpTokenInputSchema = z.object({
  label: z.string().trim().min(1, "Give this token a name.").max(60),
  scope: z.enum(["read_summary", "read_full"]),
  canWrite: z.boolean().default(false),
  durationDays: z.number().int().positive().max(MCP_TOKEN_MAX_DURATION_DAYS),
  tokenHash: z.string().min(1),
  wrap: wrappedPayloadSchema,
  salt: z.string().min(1),
});
export type MintMcpTokenInput = z.infer<typeof mintMcpTokenInputSchema>;

export interface MintMcpTokenResult extends ActionResult {
  token?: { id: string; label: string; scope: string; expiresAt: string };
}

/** Persists a new agent token. The raw token itself is never sent here —
 * the client already generated it, derived its KEK, wrapped the DEK, and
 * hashed the token (for lookup only) via src/lib/vault/crypto.ts before
 * calling this. */
export async function mintMcpToken(
  input: MintMcpTokenInput,
): Promise<MintMcpTokenResult> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };

  const parsed = mintMcpTokenInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };

  const expiresAt = new Date(
    Date.now() + parsed.data.durationDays * 24 * 60 * 60 * 1000,
  );

  const [row] = await db
    .insert(schema.mcpAgentTokens)
    .values({
      userId: auth.userId,
      label: parsed.data.label,
      tokenHash: parsed.data.tokenHash,
      wrappedDekByToken: parsed.data.wrap.ciphertext,
      tokenDekIv: parsed.data.wrap.iv,
      tokenKekSalt: parsed.data.salt,
      scope: parsed.data.scope,
      canWrite: parsed.data.canWrite,
      expiresAt,
    })
    .returning({
      id: schema.mcpAgentTokens.id,
      label: schema.mcpAgentTokens.label,
      scope: schema.mcpAgentTokens.scope,
      expiresAt: schema.mcpAgentTokens.expiresAt,
    });

  revalidatePath("/settings");
  return {
    ok: true,
    token: { ...row, expiresAt: row.expiresAt.toISOString() },
  };
}

/** Revoking deletes only this token's wrap — independent of the password
 * and recovery paths, and independent of every other minted token. No full
 * vault rotation needed, unlike revoking a lost quick-unlock device. */
export async function revokeMcpToken(id: string): Promise<ActionResult> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };

  await db
    .update(schema.mcpAgentTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.mcpAgentTokens.id, id),
        eq(schema.mcpAgentTokens.userId, auth.userId),
      ),
    );

  revalidatePath("/settings");
  return { ok: true };
}
