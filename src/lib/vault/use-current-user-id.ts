"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

/** The signed-in user's id, client-side — needed only to key the
 * device-local IndexedDB PIN-wrap record (Phase 3.5.6) per account, so a
 * second account signing into the same browser can never see the first
 * account's cached wrap. Reads straight from the browser's own Supabase
 * session; never touches the server. */
export function useCurrentUserId() {
  return useQuery({
    queryKey: ["current-user-id"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
