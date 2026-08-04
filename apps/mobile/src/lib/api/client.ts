import { createApiClient } from "@savemoney/api-client";

import { supabase } from "../supabase/client";

/**
 * Phase 5.4 — the apps/mobile instance of packages/api-client, wired to
 * this app's own Supabase session: every request carries whatever access
 * token the current session holds (refreshed automatically by the
 * Supabase client's `autoRefreshToken`), so a bearer token is never
 * stale by the time it reaches apps/web's Route Handlers.
 */
export const apiClient = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || "",
  getAccessToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
});
