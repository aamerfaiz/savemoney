import { NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { getVaultBlob } from "@/lib/vault/actions";

/**
 * Phase 5.4 prerequisite (mobile vault unlock) — see
 * docs/mobile-build-phase-plan.md §5 step 3/4. Returns the wrapped DEK
 * blobs + KDF params a client needs to unlock the vault locally (same
 * shape `getVaultBlob()` returns to the web app's unlock flow) — still
 * just ciphertext; the actual unwrap happens client-side via
 * apps/mobile/src/lib/vault/crypto.ts, never here.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const blob = await getVaultBlob();
  if ("error" in blob) {
    return NextResponse.json({ ok: false, error: blob.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...blob });
}
