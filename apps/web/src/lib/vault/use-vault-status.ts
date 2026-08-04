"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchVaultStatus } from "./actions";

/** Whether this account has a vault set up, whether recovery was
 * acknowledged, and whether it's OAuth-only — cheap metadata shared by
 * every encrypted-module gate to distinguish "never set up" (show a setup
 * prompt) from "set up but locked this session" (show an unlock prompt).
 * Invalidate the `["vault-status"]` key after `setupVault`/`rotateVault`
 * succeed so the gate picks up the change without a full reload. */
export function useVaultStatus() {
  return useQuery({
    queryKey: ["vault-status"],
    queryFn: () => fetchVaultStatus(),
    staleTime: 5 * 60 * 1000,
  });
}
