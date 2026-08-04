import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

/**
 * Phase 5.4 (see docs/mobile-build-phase-plan.md §5 step 4). Mirrors
 * apps/web/src/lib/supabase/client.ts's role (the browser client) but for
 * React Native: `AsyncStorage` persists the session across app restarts
 * (Supabase's own recipe for RN — `persistSession`/`autoRefreshToken`
 * true, `detectSessionInUrl` false since there's no browser URL bar to
 * read a session out of). `react-native-url-polyfill/auto` must load
 * before this module constructs a client — Hermes has no `URL`
 * implementation, and `@supabase/supabase-js` needs one internally.
 *
 * OAuth/magic-link (Google, email link) need PKCE + a deep-link redirect
 * back into the app — `app.json`'s `scheme` is set up for this
 * (`savemoney://`) but the actual browser-redirect flow
 * (`expo-web-browser` + `expo-linking`, `supabase.auth.exchangeCodeForSession`
 * on the resulting URL) isn't wired yet. Email/password (`signInWithPassword`)
 * needs none of that — it's a direct API call — so that's the v1 path
 * this phase actually completes; OAuth/magic-link parity is the explicit
 * gap left for a follow-up pass.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// createClient throws immediately on an empty string (not just at call
// time), so an unconfigured environment gets an inert placeholder
// instead — every real usage site checks `isSupabaseConfigured` first
// and never actually calls through to these placeholder credentials.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.invalid",
  supabaseAnonKey || "placeholder-anon-key",
  {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
