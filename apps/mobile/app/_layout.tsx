import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "../src/lib/supabase/client";
import { useVaultStore } from "../src/lib/vault/store";

/**
 * Phase 5.5a (see docs/mobile-build-phase-plan.md §5 step 5) — replaces
 * the Phase 5.4 App.tsx state machine with a real expo-router root:
 * `Stack.Protected` gates three top-level routes on the same
 * session/vault state the old App.tsx switched on. `auth`/`vault` are
 * plain (non-tab) routes; `(tabs)` is the primary app shell once both
 * are satisfied.
 */
export default function RootLayout() {
  const [session, setSession] = useState<Session | null | "loading">("loading");
  const dek = useVaultStore((s) => s.dek);
  const lock = useVaultStore((s) => s.lock);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) lock();
    });
    return () => subscription.unsubscribe();
  }, [lock]);

  if (session === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#8400ff" />
        <StatusBar style="auto" />
      </View>
    );
  }

  const signedIn = session !== null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="auth" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !dek}>
          <Stack.Screen name="vault" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !!dek}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center" },
});
