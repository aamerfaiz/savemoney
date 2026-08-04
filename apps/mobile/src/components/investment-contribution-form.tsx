import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export function InvestmentContributionForm({
  visible,
  label,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  label: string;
  busy: boolean;
  error: string | null;
  onSubmit: (amount: string, addToValue: boolean) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [addToValue, setAddToValue] = useState(true);

  function handleClose() {
    setAmount("");
    setAddToValue(true);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Add to {label}</Text>
          <TextInput
            style={styles.input}
            placeholder="Amount"
            placeholderTextColor="#666"
            keyboardType="decimal-pad"
            autoFocus
            value={amount}
            onChangeText={setAmount}
          />
          <Pressable style={styles.checkboxRow} onPress={() => setAddToValue(!addToValue)}>
            <View style={[styles.checkbox, addToValue && styles.checkboxChecked]} />
            <Text style={styles.checkboxLabel}>Also increase current value by this amount</Text>
          </Pressable>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={handleClose} disabled={busy}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.saveButton]}
              onPress={() => onSubmit(amount, addToValue)}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Add</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#151519", borderRadius: 16, padding: 20, gap: 10 },
  title: { color: "#fff", fontSize: 16, fontWeight: "700" },
  input: { backgroundColor: "#1a1a22", color: "#fff", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: "#8400ff" },
  checkboxChecked: { backgroundColor: "#8400ff" },
  checkboxLabel: { color: "#ccc", flexShrink: 1, fontSize: 13 },
  error: { color: "#f87171" },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  button: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  cancelButton: { backgroundColor: "#1a1a22" },
  saveButton: { backgroundColor: "#8400ff" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
