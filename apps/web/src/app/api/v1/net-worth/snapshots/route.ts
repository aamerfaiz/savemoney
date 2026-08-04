import { NextResponse } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { fetchNetWorthSnapshotsAction } from "@/lib/finance/side-data";

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }
  const snapshots = await fetchNetWorthSnapshotsAction();
  return NextResponse.json({ ok: true, snapshots });
}
