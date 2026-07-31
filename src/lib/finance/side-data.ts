"use server";

/**
 * Thin client-callable wrappers around query functions. loans/investments/
 * recurring/net-worth-snapshots don't touch encrypted data yet — no logic
 * changes, these just re-export the existing "server-only" functions as
 * actions. goals is the exception as of Phase 3.5.4: `fetchGoalsRaw()`
 * returns packed ciphertext now, so this wrapper can no longer compute
 * `GoalsData` itself — see src/lib/finance/use-side-data.ts, which decrypts
 * and calls src/lib/goals/compute.ts client-side instead.
 */

import { fetchGoalsRaw } from "@/lib/goals/queries";
import { getLoansData } from "@/lib/loans/queries";
import { getInvestmentsData } from "@/lib/investments/queries";
import { getRecurringData } from "@/lib/recurring/queries";
import { fetchNetWorthSnapshots } from "@/lib/networth/queries";
import { getBillCalendarData } from "@/lib/calendar/queries";
import { createClient } from "@/lib/supabase/server";

export async function fetchGoalsDataAction() {
  return fetchGoalsRaw();
}

export async function fetchLoansDataAction() {
  return getLoansData();
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

export async function fetchBillCalendarAction() {
  return getBillCalendarData();
}
