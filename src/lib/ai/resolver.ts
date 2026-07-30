import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "./crypto";
import { getProvider } from "./registry";
import type { ChatMessage } from "./types";

/**
 * The one chokepoint every AI feature calls through: loads the user's active
 * key, decrypts it, dispatches to the right adapter. Never call a provider
 * adapter or vendor SDK directly from a feature — see AGENTS.md "AI
 * providers & user API keys".
 */
export async function chatWithActiveProvider(
  messages: ChatMessage[],
): Promise<string> {
  if (!db) {
    throw new Error("Database isn't configured in this environment.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You need to sign in first.");

  const [row] = await db
    .select()
    .from(schema.aiProviderKeys)
    .where(
      and(
        eq(schema.aiProviderKeys.userId, user.id),
        eq(schema.aiProviderKeys.isActive, true),
        isNull(schema.aiProviderKeys.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error("No active AI provider key. Add one in Settings → AI & Integrations.");
  }

  const apiKey = decryptSecret({ ciphertext: row.encryptedKey, iv: row.keyIv });
  const provider = getProvider(row.provider);
  return provider.chat(apiKey, messages, row.model ?? undefined);
}
