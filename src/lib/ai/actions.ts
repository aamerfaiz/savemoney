"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "./crypto";
import { getProvider } from "./registry";
import { PROVIDER_META } from "./meta";
import { chatWithActiveProvider } from "./resolver";
import { buildFinanceContext } from "./context";
import type { AIProviderId } from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." } as const;
  return { userId: user.id } as const;
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
 * Test + persist a new provider key, encrypted. Only one key is active at a
 * time today (the resolver loads "the" active key, no per-provider slot
 * yet) — saving a new one deactivates any existing key for this user.
 */
export async function saveProviderKey(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  if (!db) return { ok: false, error: "Database isn't configured in this environment." };

  const parsed = keyInputSchema.safeParse({
    provider: formData.get("provider"),
    apiKey: formData.get("apiKey"),
    model: formData.get("model") || undefined,
    label: formData.get("label") || undefined,
  });
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
  const adapter = getProvider(parsed.data.provider);
  const tested = await adapter.testKey(parsed.data.apiKey, model);
  if (!tested.ok) {
    return { ok: false, error: tested.error ?? "That key didn't pass the connection test." };
  }

  const { ciphertext, iv } = encryptSecret(parsed.data.apiKey);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.aiProviderKeys)
      .set({ isActive: false })
      .where(eq(schema.aiProviderKeys.userId, auth.userId));

    await tx.insert(schema.aiProviderKeys).values({
      userId: auth.userId,
      provider: parsed.data.provider,
      label: parsed.data.label || null,
      encryptedKey: ciphertext,
      keyIv: iv,
      keyLast4: parsed.data.apiKey.slice(-4),
      model,
      isActive: true,
    });
  });

  revalidatePath("/settings");
  revalidatePath("/ai");
  return { ok: true };
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

export interface AskResult {
  ok: boolean;
  answer?: string;
  error?: string;
}

const GENERIC_SYSTEM_PROMPT =
  "You are the Finance OS AI assistant. Answer briefly and concretely about the user's personal finances. If you don't have enough data, say what's missing instead of guessing.";

/** Phase 3.3 — single-turn "ask a question" backed by the active provider. */
export async function askAssistant(
  _prev: AskResult | undefined,
  formData: FormData,
): Promise<AskResult> {
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { ok: false, error: "Type a question first." };

  // Ground the answer in the user's real numbers when we can build them;
  // fall back to a generic assistant rather than failing the whole request
  // if a data query has a hiccup.
  let context: string | null = null;
  try {
    context = await buildFinanceContext();
  } catch {
    context = null;
  }

  const systemPrompt = context
    ? `You are the Finance OS AI assistant. Use ONLY the real financial data below to ground your answer — never invent numbers. If something the user asks about isn't covered by this data, say so instead of guessing. Be concise and concrete.\n\n${context}`
    : GENERIC_SYSTEM_PROMPT;

  try {
    const answer = await chatWithActiveProvider([
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ]);
    return { ok: true, answer };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
