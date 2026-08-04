"use client";

/**
 * Every finance mutation (create/update/delete, across transactions,
 * budgets, goals, loans, investments, recurring rules, net-worth
 * snapshots, import, AI smart entry) writes through a Server Action, but
 * the pages that display the result read through the client-side
 * `useFinanceData`/`useSideData` TanStack Query hooks (Phase 3.5.3 — data
 * has to be decrypted in the browser, so it can no longer be re-read via a
 * Server Component + `router.refresh()`). `router.refresh()` alone does
 * not invalidate either query, so a mutation's result silently didn't
 * appear until the 60s staleTime lapsed and something remounted the query.
 *
 * Every module feeds the safe-to-spend/health-score numbers on
 * `useFinanceData` (goal contributions, loan EMIs, investment SIPs), so a
 * mutation on any module invalidates both keys rather than trying to track
 * which one a given change actually affects.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export function useInvalidateFinanceData() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["finance-data"] });
    queryClient.invalidateQueries({ queryKey: ["finance-side-data"] });
  }, [queryClient]);
}
