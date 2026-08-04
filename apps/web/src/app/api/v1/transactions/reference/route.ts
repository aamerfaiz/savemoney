import { NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { getAccounts, getCategories } from "@/lib/transactions/reference";

/** Phase 5.5b — category/account options for the create/edit form.
 * Plaintext, RLS-scoped reads (no encrypted fields involved), so this is
 * a plain pass-through, same as the vault status route. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const [categories, accounts] = await Promise.all([getCategories(), getAccounts()]);
  return NextResponse.json({ ok: true, categories, accounts });
}
