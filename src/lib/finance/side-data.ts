"use server";

/**
 * Thin client-callable wrappers around query functions. net-worth-snapshots
 * is the only one left that's just a raw-ciphertext passthrough with no
 * further server logic. goals, loans, investments, and recurring are the
 * other Phase 3.5.4 exceptions: `fetchGoalsRaw()`/`fetchLoansRaw()`/
 * `fetchInvestmentsRaw()`/`fetchRecurringRulesRaw()` return packed
 * ciphertext now, so these wrappers can no longer compute
 * `GoalsData`/`LoansData`/`InvestmentsData`/`RecurringData` themselves —
 * see src/lib/finance/use-side-data.ts, which decrypts and calls
 * src/lib/goals/compute.ts / src/lib/loans/compute.ts /
 * src/lib/investments/compute.ts / src/lib/recurring/compute.ts
 * client-side instead. `fetchBillCalendarAction` now takes already-
 * decrypted loans and rules as parameters for the same reason —
 * `getBillCalendarData()` used to fetch both itself server-side.
 */

import { fetchGoalsRaw } from "@/lib/goals/queries";
import { fetchLoansRaw } from "@/lib/loans/queries";
import { fetchInvestmentsRaw } from "@/lib/investments/queries";
import { fetchRecurringRulesRaw } from "@/lib/recurring/queries";
import { fetchNetWorthSnapshotsRaw } from "@/lib/networth/queries";
import { getBillCalendarData } from "@/lib/calendar/queries";
import { createClient } from "@/lib/supabase/server";
import type { LoanWithProjection } from "@/lib/loans/types";
import type { RecurringRuleWithSchedule } from "@/lib/recurring/types";

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
  return fetchRecurringRulesRaw();
}

export async function fetchNetWorthSnapshotsAction() {
  const supabase = await createClient();
  return fetchNetWorthSnapshotsRaw(supabase);
}

export async function fetchBillCalendarAction(
  loans: LoanWithProjection[],
  rules: RecurringRuleWithSchedule[],
) {
  return getBillCalendarData(loans, rules);
}
