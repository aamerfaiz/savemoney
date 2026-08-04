import { NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { fetchFinanceRawData } from "@/lib/finance/raw-data";

/**
 * Phase 5.5b — the one shared raw-fetch boundary for encrypted finance
 * data, mirroring `fetchFinanceRawData()`'s own role on the web app (see
 * its doc comment in apps/web/src/lib/finance/raw-data.ts): every module
 * that needs decrypted finance data goes through this single Route
 * Handler, not one per module. Transactions is the first consumer;
 * Dashboard/Budget/Goals/Loans/Investments/Net Worth (Phase 5.5c) reuse
 * it rather than getting their own routes.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const data = await fetchFinanceRawData();
  if ("error" in data) {
    return NextResponse.json({ ok: false, error: data.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...data });
}
