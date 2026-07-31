"use server";

/**
 * Thin client-callable wrappers around query functions that don't touch
 * encrypted data (goals/loans/investments/recurring/net-worth-snapshots
 * aren't in Phase 3.5.3's scope). Pages that compose them together with
 * now-client-side budgets/analytics (Dashboard, Net Worth, Reports,
 * Notifications) need them reachable from client code — no logic changes,
 * these just re-export the existing "server-only" functions as actions.
 */

import { getGoalsData } from "@/lib/goals/queries";
import { getLoansData } from "@/lib/loans/queries";
import { getInvestmentsData } from "@/lib/investments/queries";
import { getRecurringData } from "@/lib/recurring/queries";
import { fetchNetWorthSnapshots } from "@/lib/networth/queries";
import { getBillCalendarData } from "@/lib/calendar/queries";
import { createClient } from "@/lib/supabase/server";

export async function fetchGoalsDataAction() {
  return getGoalsData();
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
