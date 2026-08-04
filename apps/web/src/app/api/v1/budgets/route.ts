import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createBudget } from "@/lib/budgets/actions";

/** Phase 5.5c (Budget). Reads reuse the shared /api/v1/finance/raw
 * boundary (its `budgets`/`income`/`expenses`/`activeGoals`/`loans`/
 * `investmentMonthlyContributions` fields are exactly what
 * computeBudgetsData() needs) — this route is create-only. */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const result = await createBudget(json);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
