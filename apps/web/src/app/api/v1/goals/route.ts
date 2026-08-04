import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { fetchGoalsRaw } from "@/lib/goals/queries";
import { createGoal } from "@/lib/goals/actions";

/** Phase 5.5c (Goals) — the Goals page's own full-list read
 * (`fetchGoalsRaw`, separate from the shared `/api/v1/finance/raw`
 * boundary, mirroring web's own two-path structure: the shared boundary
 * feeds Dashboard/Budget's aggregate needs, each module's own page reads
 * its full list here). */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const goals = await fetchGoalsRaw();
  return NextResponse.json({ ok: true, goals });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const json = await request.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const result = await createGoal(json);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
