"use server";

/**
 * Thin client-callable wrappers around query functions. recurring doesn't
 * touch encrypted data yet — no logic changes, this one just re-exports the
 * existing "server-only" function as an action. goals, loans, investments,
 * and net-worth-snapshots are the exceptions as of Phase 3.5.4:
 * `fetchGoalsRaw()`/`fetchLoansRaw()`/`fetchInvestmentsRaw()`/
 * `fetchNetWorthSnapshotsRaw()` return packed ciphertext now, so these
 * wrappers can no longer compute `GoalsData`/`LoansData`/`InvestmentsData`/
 * `SnapshotSummary[]` themselves — see src/lib/finance/use-side-data.ts,
 * which decrypts and calls src/lib/goals/compute.ts /
 * src/lib/loans/compute.ts / src/lib/investments/compute.ts client-side
 * instead. `fetchBillCalendarAction` now takes already-decrypted loans as a
 * parameter for the same reason — `getBillCalendarData()` used to fetch
 * loans itself server-side.
 */

import { fetchGoalsRaw } from "@/lib/goals/queries";
import { fetchLoansRaw } from "@/lib/loans/queries";
import { fetchInvestmentsRaw } from "@/lib/investments/queries";
import { getRecurringData } from "@/lib/recurring/queries";
import { fetchNetWorthSnapshotsRaw } from "@/lib/networth/queries";
import { getBillCalendarData } from "@/lib/calendar/queries";
import { createClient } from "@/lib/supabase/server";
import type { LoanWithProjection } from "@/lib/loans/types";

export async function fetchGoalsDataAction() {
  return fetchGoalsRaw();
}

export async function fetchLoansDataAction() {
  return fetchLoansRaw();
}

export async function fetchInvestmentsDataAction() {
  return fetchInvestmentsRaw();
}

export async function fetchRecurringDataAction() {
  return getRecurringData();
}

export async function fetchNetWorthSnapshotsAction() {
  const supabase = await createClient();
  return fetchNetWorthSnapshotsRaw(supabase);
}

export async function fetchBillCalendarAction(loans: LoanWithProjection[]) {
  return getBillCalendarData(loans);
}
