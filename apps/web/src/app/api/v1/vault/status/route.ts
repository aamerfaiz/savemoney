import { NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { fetchVaultStatus } from "@/lib/vault/actions";

/**
 * Phase 5.4 prerequisite (mobile vault unlock) — see
 * docs/mobile-build-phase-plan.md §5 step 3/4. Mirrors what
 * Settings/the vault-gate UI already calls via `fetchVaultStatus()`
 * (a Server Action) — this Route Handler exists purely so a mobile
 * client (no access to Next's Server Action protocol) can reach the same
 * data over a plain bearer-authenticated REST call.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const status = await fetchVaultStatus();
  return NextResponse.json({ ok: true, status });
}
