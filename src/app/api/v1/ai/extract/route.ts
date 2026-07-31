import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireApiUser } from "@/lib/ai/api-auth";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { extractDraftItems } from "@/lib/ai/smart-entry/extract";
import { resolveDraftItems } from "@/lib/ai/smart-entry/resolve";

const bodySchema = z.object({
  prompt: z.string().trim().min(1, "Type something first.").max(2000),
});

/**
 * Prompt in, a resolved-but-unwritten draft list out. Nothing in this
 * request path touches the database beyond reads scoped to the caller
 * (categories/accounts/investments/loans/goals, for name matching) — see
 * "No code-execution surface" in docs/ai-smart-entry-plan.md. Commits only
 * ever happen via a separate, explicit call to `/api/v1/ai/commit`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const rate = checkRateLimit(auth.userId, "ai_extract");
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

  const extracted = await extractDraftItems(parsed.data.prompt);
  if ("error" in extracted) {
    return NextResponse.json({ ok: false, error: extracted.error }, { status: 502 });
  }

  const drafts = await resolveDraftItems(extracted.items);
  return NextResponse.json({ ok: true, drafts });
}
