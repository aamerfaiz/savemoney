"use server";

/**
 * Thin client-callable wrappers around query functions. investments/
 * recurring/net-worth-snapshots don't touch encrypted data yet — no logic
 * changes, these just re-export the existing "server-only" functions as
 * actions. goals and loans are the exceptions as of Phase 3.5.4:
 * `fetchGoalsRaw()`/`fetchLoansRaw()` return packed ciphertext now, so these
 * wrappers can no longer compute `GoalsData`/`LoansData` themselves — see
 * src/lib/finance/use-side-data.ts, which decrypts and calls
 * src/lib/goals/compute.ts / src/lib/loans/compute.ts client-side instead.
 * `fetchBillCalendarAction` now takes already-decrypted loans as a
 * parameter for the same reason — `getBillCalendarData()` used to fetch
 * loans itself server-side.
 */

import { fetchGoalsRaw } from "@/lib/goals/queries";
import { fetchLoansRaw } from "@/lib/loans/queries";
import { getInvestmentsData } from "@/lib/investments/queries";
import { getRecurringData } from "@/lib/recurring/queries";
import { fetchNetWorthSnapshots } from "@/lib/networth/queries";
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
  return getInvestmentsData();
}

export async function fetchRecurringDataAction() {
  return getRecurringData();
}

export async function fetchNetWorthSnapshotsAction() {
  const supabase = await createClient();
  return fetchNetWorthSnapshots(supabase);
}

export async function fetchBillCalendarAction(loans: LoanWithProjection[]) {
  return getBillCalendarData(loans);
}
