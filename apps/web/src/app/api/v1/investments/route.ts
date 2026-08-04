import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { fetchInvestmentsRaw } from "@/lib/investments/queries";
import { createInvestment } from "@/lib/investments/actions";

/** Phase 5.5c (Investments) — own full-list read, same two-path structure
 * as Goals/Loans. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const investments = await fetchInvestmentsRaw();
  return NextResponse.json({ ok: true, investments });
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
  const result = await createInvestment(json);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
