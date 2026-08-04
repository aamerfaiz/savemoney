import { Pressable, StyleSheet, Text, View } from "react-native";

import { supabase } from "../lib/supabase/client";
import { useVaultStore } from "../lib/vault/store";

/**
 * Phase 5.4 stopping point — proves auth + vault unlock work end to end.
 * Real finance screens (Transactions first, per the build plan) are
 * Phase 5.5; this is deliberately just a confirmation + sign-out so this
 * phase's own scope stays testable on its own.
 */
export function UnlockedScreen() {
  const lock = useVaultStore((s) => s.lock);

  async function handleSignOut() {
    lock();
    await supabase.auth.signOut();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vault unlocked</Text>
      <Text style={styles.subtitle}>
        Auth + vault unlock are wired end to end. Real screens (Transactions first) land in
        Phase 5.5.
      </Text>
      <Pressable style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Lock &amp; sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", padding: 24, justifyContent: "center", gap: 12 },
  title: { color: "#4ade80", fontSize: 24, fontWeight: "700", textAlign: "center" },
  subtitle: { color: "#888", textAlign: "center" },
  button: {
    backgroundColor: "#1a1a22",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: { color: "#f87171", fontWeight: "600" },
});
