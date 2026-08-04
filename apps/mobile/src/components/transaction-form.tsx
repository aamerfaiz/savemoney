import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { Transaction } from "../lib/transactions/types";

/**
 * Phase 5.5b — a deliberately minimal create/edit form relative to
 * apps/web/src/components/transactions/transaction-form.tsx: no native
 * date picker (plain YYYY-MM-DD text entry) and no category/account
 * picker UI yet (the reference data is fetched by the screen, just not
 * wired into a picker control here). Both are flagged UI-polish gaps,
 * not silently dropped — the underlying create/update calls already
 * accept `categoryId`/`accountId`, so wiring a picker in later is
 * additive, not a rework.
 */
export interface TransactionFormValues {
  kind: "income" | "expense";
  amount: string;
  date: string;
  description: string;
}

export function TransactionForm({
  visible,
  editing,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  editing: Transaction | null;
  busy: boolean;
  error: string | null;
  onSubmit: (values: TransactionFormValues) => void;
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<"income" | "expense">(editing?.kind === "income" ? "income" : "expense");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [date, setDate] = useState(editing?.date ?? today);
  const [description, setDescription] = useState(editing?.description ?? "");

  function reset() {
    setKind("expense");
    setAmount("");
    setDate(today);
    setDescription("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    onSubmit({ kind, amount, date, description });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{editing ? "Edit transaction" : "Add transaction"}</Text>

          <View style={styles.kindRow}>
            <Pressable
              style={[styles.kindButton, kind === "expense" && styles.kindButtonActiveExpense]}
              onPress={() => setKind("expense")}
            >
              <Text style={styles.kindButtonText}>Expense</Text>
            </Pressable>
            <Pressable
              style={[styles.kindButton, kind === "income" && styles.kindButtonActiveIncome]}
              onPress={() => setKind("income")}
            >
              <Text style={styles.kindButtonText}>Income</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Amount"
            placeholderTextColor="#666"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            style={styles.input}
            placeholder="Date (YYYY-MM-DD)"
            placeholderTextColor="#666"
            value={date}
            onChangeText={setDate}
          />
          <TextInput
            style={styles.input}
            placeholder="Description (optional)"
            placeholderTextColor="#666"
            value={description}
            onChangeText={setDescription}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={handleClose} disabled={busy}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.saveButton]} onPress={handleSubmit} disabled={busy}>
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
  kindRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  kindButton: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#1a1a22", alignItems: "center" },
  kindButtonActiveExpense: { backgroundColor: "#7f1d1d" },
  kindButtonActiveIncome: { backgroundColor: "#14532d" },
  kindButtonText: { color: "#fff", fontWeight: "600" },
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
