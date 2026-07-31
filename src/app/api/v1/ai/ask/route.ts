import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireApiUser } from "@/lib/ai/api-auth";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { chatWithProvider } from "@/lib/ai/resolver";
import { buildFinanceContext } from "@/lib/ai/context";
import { PROVIDER_META } from "@/lib/ai/meta";
import type { AIProviderId } from "@/lib/ai/types";

const providerIds = PROVIDER_META.map((p) => p.id) as [AIProviderId, ...AIProviderId[]];

const bodySchema = z.object({
  question: z.string().trim().min(1, "Type a question first.").max(2000),
  // Decrypted client-side from the vault DEK, forwarded once for this
  // request only — see docs/e2ee-path-b-plan.md "Resolved: the AI
  // Assistant conflict". Never logged, never persisted here.
  apiKey: z.string().trim().min(1, "Add an AI provider key in Settings first."),
  provider: z.enum(providerIds),
  model: z.string().trim().optional(),
});

const GENERIC_SYSTEM_PROMPT =
  "You are the Finance OS AI assistant. Answer briefly and concretely about the user's personal finances. If you don't have enough data, say what's missing instead of guessing.";

/**
 * The transient relay for the Ask feature (Phase 3.5.2). The browser
 * decrypts its saved vendor key with the unlocked vault's DEK and sends
 * the *plaintext* key here, once, in this request body. This handler uses
 * it immediately to call the vendor and never logs or persists it — it
 * exists in server memory for the lifetime of this one request only.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const rate = checkRateLimit(auth.userId, "ai_ask");
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  // Ground the answer in the user's real numbers when we can build them;
  // fall back to a generic assistant rather than failing the whole request
  // if a data query has a hiccup. Finance data itself isn't under the vault
  // yet (that's 3.5.3+), so this read is unaffected by this change.
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
    const answer = await chatWithProvider(
      parsed.data.apiKey,
      parsed.data.provider,
      parsed.data.model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: parsed.data.question },
      ],
    );
    return NextResponse.json({ ok: true, answer });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Something went wrong." },
      { status: 502 },
    );
  }
}
