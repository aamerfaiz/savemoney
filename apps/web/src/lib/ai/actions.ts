"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { requireUser } from "@/lib/supabase/require-user";
import { getProvider } from "./registry";
import { PROVIDER_META } from "./meta";
import type { AIProviderId } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const providerIds = PROVIDER_META.map((p) => p.id) as [
  AIProviderId,
  ...AIProviderId[],
];

const keyInputSchema = z.object({
  provider: z.enum(providerIds),
  apiKey: z.string().trim().min(8, "That key looks too short."),
  model: z.string().trim().optional(),
  label: z.string().trim().max(60).optional(),
});

const wrappedPayloadSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
});

const saveProviderKeyInputSchema = z.object({
  provider: z.enum(providerIds),
  model: z.string().trim().optional(),
  label: z.string().trim().max(60).optional(),
  keyLast4: z.string().length(4),
  wrap: wrappedPayloadSchema,
});
export type SaveProviderKeyInput = z.infer<typeof saveProviderKeyInputSchema>;

function providerMetaFor(id: AIProviderId) {
  return PROVIDER_META.find((p) => p.id === id);
}

/** Verify a key against the vendor's API without persisting anything. */
export async function testProviderKey(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = keyInputSchema
    .pick({ provider: true, apiKey: true, model: true })
    .safeParse({
      provider: formData.get("provider"),
      apiKey: formData.get("apiKey"),
      model: formData.get("model") || undefined,
    });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const meta = providerMetaFor(parsed.data.provider);
  if (!meta?.available) {
    return { ok: false, error: `${meta?.label ?? parsed.data.provider} isn't wired up yet.` };
  }

  const adapter = getProvider(parsed.data.provider);
  const result = await adapter.testKey(parsed.data.apiKey, parsed.data.model || meta.defaultModel);
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? "Key test failed." };
}

/**
 * Persist a new provider key. Ciphertext only — the client already tested
 * the key (via `testProviderKey` below) and encrypted it with the vault
 * DEK before calling this; there is no server-side "read plaintext" path
 * for this table under Phase 3.5 (see docs/e2ee-path-b-plan.md "Resolved:
 * the AI Assistant conflict"). Only one key is active at a time today (the
 * resolver loads "the" active key, no per-provider slot yet) — saving a
 * new one deactivates any existing key for this user.
 */
export async function saveProviderKey(
  input: SaveProviderKeyInput,
): Promise<ActionResult> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };

  const parsed = saveProviderKeyInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };

  const meta = providerMetaFor(parsed.data.provider);
  if (!meta?.available) {
    return { ok: false, error: `${meta?.label ?? parsed.data.provider} isn't wired up yet.` };
  }

  const model = parsed.data.model || meta.defaultModel;

  await db.transaction(async (tx) => {
    await tx
      .update(schema.aiProviderKeys)
      .set({ isActive: false })
      .where(eq(schema.aiProviderKeys.userId, auth.userId));

    await tx.insert(schema.aiProviderKeys).values({
      userId: auth.userId,
      provider: parsed.data.provider,
      label: parsed.data.label || null,
      encryptedKey: parsed.data.wrap.ciphertext,
      keyIv: parsed.data.wrap.iv,
      keyLast4: parsed.data.keyLast4,
      model,
      isActive: true,
    });
  });

  revalidatePath("/settings");
  revalidatePath("/ai");
  return { ok: true };
}

/**
 * The active key's ciphertext + IV, for client-side decryption with the
 * unlocked vault's DEK — never decrypted here. Returns `hasKey: false` if
 * there's no active key, distinct from an auth/config error.
 */
export async function getActiveProviderKeyBlob() {
  if (!db) return { error: "Database isn't configured in this environment." } as const;
  const auth = await requireUser();
  if ("error" in auth) return { error: auth.error } as const;

  const [row] = await db
    .select({
      provider: schema.aiProviderKeys.provider,
      model: schema.aiProviderKeys.model,
      encryptedKey: schema.aiProviderKeys.encryptedKey,
      keyIv: schema.aiProviderKeys.keyIv,
    })
    .from(schema.aiProviderKeys)
    .where(
      and(
        eq(schema.aiProviderKeys.userId, auth.userId),
        eq(schema.aiProviderKeys.isActive, true),
        isNull(schema.aiProviderKeys.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return { hasKey: false } as const;

  return {
    hasKey: true,
    provider: row.provider,
    model: row.model,
    wrap: { ciphertext: row.encryptedKey, iv: row.keyIv },
  } as const;
}

/** Make a stored key the active one, deactivating any others. */
export async function setActiveProviderKey(id: string): Promise<ActionResult> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.aiProviderKeys)
      .set({ isActive: false })
      .where(eq(schema.aiProviderKeys.userId, auth.userId));
    await tx
      .update(schema.aiProviderKeys)
      .set({ isActive: true })
      .where(
        and(
          eq(schema.aiProviderKeys.id, id),
          eq(schema.aiProviderKeys.userId, auth.userId),
        ),
      );
  });

  revalidatePath("/settings");
  revalidatePath("/ai");
  return { ok: true };
}

/** Soft-delete a stored key. */
export async function deleteProviderKey(id: string): Promise<ActionResult> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };
  const auth = await requireUser();
  if ("error" in auth) return { ok: false, error: auth.error };

  await db
    .update(schema.aiProviderKeys)
    .set({ deletedAt: new Date(), isActive: false })
    .where(
      and(
        eq(schema.aiProviderKeys.id, id),
        eq(schema.aiProviderKeys.userId, auth.userId),
      ),
    );

  revalidatePath("/settings");
  revalidatePath("/ai");
  return { ok: true };
}

// Ask no longer lives here as a Server Action — the decrypt-then-relay
// sequence it needs (client unwraps its key with the vault DEK, then
// forwards it transiently) runs from the client component straight to
// /api/v1/ai/ask instead. See src/lib/ai/client-key.ts and
// src/components/ai/ai-assistant-view.tsx.
