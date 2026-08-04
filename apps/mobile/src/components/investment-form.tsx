import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

/** Phase 5.5c — minimal relative to web: no investment-type picker
 * (defaults to "stocks"), plain text date entry. */
export function InvestmentForm({
  visible,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (values: { name: string; investedAmount: string; currentValue: string; expectedReturn: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [investedAmount, setInvestedAmount] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");

  function reset() {
    setName("");
    setInvestedAmount("");
    setCurrentValue("");
    setExpectedReturn("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Add investment</Text>

          <TextInput style={styles.input} placeholder="Name" placeholderTextColor="#666" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Invested amount" placeholderTextColor="#666" keyboardType="decimal-pad" value={investedAmount} onChangeText={setInvestedAmount} />
          <TextInput style={styles.input} placeholder="Current value" placeholderTextColor="#666" keyboardType="decimal-pad" value={currentValue} onChangeText={setCurrentValue} />
          <TextInput style={styles.input} placeholder="Expected annual return (%)" placeholderTextColor="#666" keyboardType="decimal-pad" value={expectedReturn} onChangeText={setExpectedReturn} />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={handleClose} disabled={busy}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.saveButton]}
              onPress={() => onSubmit({ name, investedAmount, currentValue, expectedReturn })}
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
  input: { backgroundColor: "#1a1a22", color: "#fff", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  error: { color: "#f87171" },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  button: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  cancelButton: { backgroundColor: "#1a1a22" },
  saveButton: { backgroundColor: "#8400ff" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
