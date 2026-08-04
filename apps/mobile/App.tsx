import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./src/lib/supabase/client";
import { useVaultStore } from "./src/lib/vault/store";
import { AuthScreen } from "./src/screens/auth-screen";
import { VaultScreen } from "./src/screens/vault-screen";
import { UnlockedScreen } from "./src/screens/unlocked-screen";

/**
 * Phase 5.4 (see docs/mobile-build-phase-plan.md §5 step 4): auth +
 * vault-unlock flow, wired end to end. Not real navigation — Phase 5.5
 * builds the Expo Router shell; this is a plain state machine over three
 * screens (auth -> vault setup/unlock -> unlocked) since that's all this
 * phase needs to prove out. The Phase 5.2 crypto spike screen is gone —
 * this *is* that same code now exercised for real, through the actual
 * unlock flow, not a throwaway test harness.
 */
export default function App() {
  const [session, setSession] = useState<Session | null | "loading">("loading");
  const dek = useVaultStore((s) => s.dek);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) setVaultUnlocked(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#8400ff" />
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <AuthScreen />
        <StatusBar style="auto" />
      </>
    );
  }

  if (!dek || !vaultUnlocked) {
    return (
      <>
        <VaultScreen onUnlocked={() => setVaultUnlocked(true)} />
        <StatusBar style="auto" />
      </>
    );
  }

  return (
    <>
      <UnlockedScreen />
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center" },
});
