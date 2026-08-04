import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { fetchLoansRaw } from "@/lib/loans/queries";
import { createLoan } from "@/lib/loans/actions";

/** Phase 5.5c (Loans) — own full-list read, same two-path structure as
 * Goals (see that route's doc comment). */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const loans = await fetchLoansRaw();
  return NextResponse.json({ ok: true, loans });
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
  const result = await createLoan(json);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
