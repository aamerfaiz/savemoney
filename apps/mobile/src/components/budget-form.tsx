import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

/** Phase 5.5c — same minimal-relative-to-web pattern as
 * transaction-form.tsx: no category picker yet (creates an overall
 * budget, categoryId null, unless one is added later), no period picker
 * beyond a 3-way toggle. */
export function BudgetForm({
  visible,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (values: { period: "weekly" | "monthly" | "yearly"; amount: string }) => void;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [amount, setAmount] = useState("");

  function reset() {
    setPeriod("monthly");
    setAmount("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Add budget</Text>

          <View style={styles.periodRow}>
            {(["weekly", "monthly", "yearly"] as const).map((p) => (
              <Pressable
                key={p}
                style={[styles.periodButton, period === p && styles.periodButtonActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={styles.periodButtonText}>{p}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Amount"
            placeholderTextColor="#666"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={handleClose} disabled={busy}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.saveButton]}
              onPress={() => onSubmit({ period, amount })}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#151519", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 10 },
  title: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  periodRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  periodButton: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#1a1a22", alignItems: "center" },
  periodButtonActive: { backgroundColor: "#8400ff" },
  periodButtonText: { color: "#fff", fontWeight: "600", textTransform: "capitalize" },
  input: {
    backgroundColor: "#1a1a22",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: { color: "#f87171" },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  button: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  cancelButton: { backgroundColor: "#1a1a22" },
  saveButton: { backgroundColor: "#8400ff" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
