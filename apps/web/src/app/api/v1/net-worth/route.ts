import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { captureSnapshot } from "@/lib/networth/actions";

/** Phase 5.5c (Net Worth) — captures today's snapshot. */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const json = await request.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const result = await captureSnapshot(json);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
