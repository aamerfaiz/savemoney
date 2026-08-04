import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createTransaction } from "@/lib/transactions/actions";

/**
 * Phase 5.5b (Transactions, the reference module — see
 * docs/mobile-build-phase-plan.md §5 step 5). Thin wrapper around the
 * existing `createTransaction` Server Action, same pattern as
 * `/api/v1/vault/setup`: auth check, then hand the already-validated-
 * shape JSON body straight through — `createTransaction` re-validates
 * it itself (encryptedTransactionInputSchema), so this route isn't a
 * second, divergent validation path.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const result = await createTransaction(json);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
