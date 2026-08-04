import { Pressable, StyleSheet, Text, View } from "react-native";

import { ComingSoon } from "../../src/components/coming-soon";
import { supabase } from "../../src/lib/supabase/client";
import { useVaultStore } from "../../src/lib/vault/store";

/** Sign-out lives here temporarily — Settings (with the rest of its web
 * counterpart's controls: vault rotation, agent access, etc.) is a later
 * Phase 5.5c module, not part of the v1 module list in
 * docs/mobile-build-phase-plan.md §5 step 5. Move it there once that
 * screen exists. */
export default function Dashboard() {
  const lock = useVaultStore((s) => s.lock);

  async function handleSignOut() {
    lock();
    await supabase.auth.signOut();
  }

  return (
    <View style={styles.container}>
      <ComingSoon title="Dashboard" />
      <Pressable style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Lock &amp; sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  button: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: "#1a1a22",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#f87171", fontWeight: "600" },
});
