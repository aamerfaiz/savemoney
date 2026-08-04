import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireApiUser } from "@/lib/ai/api-auth";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { commitDraftItems } from "@/lib/ai/smart-entry/commit";

const MAX_ITEMS = 10;

const itemSchema = z.object({
  capability: z.string(),
  fields: z.record(z.string(), z.unknown()),
  targetId: z.string().uuid().optional(),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1, "Nothing to add.").max(MAX_ITEMS),
});

/**
 * The only place in Smart Entry that writes. Every item is re-validated
 * against its capability's real Zod schema and (for contribution/payment
 * capabilities) has its target ownership re-checked here — never trusted
 * from the request body, even though it typically round-tripped through
 * this same user's own `/extract` call moments earlier. See "McHire" in
 * docs/ai-smart-entry-plan.md.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const rate = checkRateLimit(auth.userId, "ai_commit");
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

  const results = await commitDraftItems(parsed.data.items);
  return NextResponse.json({ ok: true, results });
}
