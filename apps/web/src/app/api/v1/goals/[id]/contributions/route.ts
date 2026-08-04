import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { addContribution } from "@/lib/goals/actions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const { id } = await params;
  const json = await request.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const result = await addContribution(id, json);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
