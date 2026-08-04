import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { setupVault } from "@/lib/vault/actions";

/**
 * Phase 5.4 prerequisite (mobile vault unlock) — see
 * docs/mobile-build-phase-plan.md §5 step 3/4. First-time vault setup
 * over a bearer-authenticated REST call, for a mobile client. Body shape
 * matches `SetupVaultInput` exactly — `setupVault()` itself validates it
 * with the same Zod schema the web app's Server Action uses, so this
 * route is a thin auth + transport wrapper, not a second validation path.
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

  const result = await setupVault(json);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
