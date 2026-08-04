import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { deleteGoal, updateGoal } from "@/lib/goals/actions";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const { id } = await params;
  const json = await request.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const result = await updateGoal(id, json);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const { id } = await params;
  const result = await deleteGoal(id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
