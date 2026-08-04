import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { deleteTransaction, updateTransaction } from "@/lib/transactions/actions";
import type { TransactionKind } from "@/lib/transactions/types";

/** Phase 5.5b — `kind` comes from the request body for PATCH (it's already
 * part of `EncryptedTransactionInput`) and from a `?kind=` query param for
 * DELETE (no body on a delete call). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const json = await request.json().catch(() => null);
  if (!json || (json.kind !== "income" && json.kind !== "expense")) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const result = await updateTransaction(id, json.kind, json);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const kind = request.nextUrl.searchParams.get("kind") as TransactionKind | null;
  if (kind !== "income" && kind !== "expense") {
    return NextResponse.json({ ok: false, error: "Missing or invalid ?kind=." }, { status: 400 });
  }

  const result = await deleteTransaction(id, kind);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
