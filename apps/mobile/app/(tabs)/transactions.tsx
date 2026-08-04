import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { formatCurrency } from "@savemoney/finance-engine/format";

import { apiClient } from "../../src/lib/api/client";
import {
  createTransaction as createTransactionAction,
  deleteTransaction as deleteTransactionAction,
  updateTransaction as updateTransactionAction,
} from "../../src/lib/transactions/client-actions";
import { computeTransactionsList, summarize } from "../../src/lib/transactions/compute";
import {
  decryptContributionRows,
  decryptExpenseRows,
  decryptIncomeRows,
} from "../../src/lib/finance/decrypt";
import type { Transaction } from "../../src/lib/transactions/types";
import { TransactionForm, type TransactionFormValues } from "../../src/components/transaction-form";
import { useVaultStore } from "../../src/lib/vault/store";

/**
 * Phase 5.5b — the reference module's mobile screen. Every finance value
 * is packed ciphertext over the wire (`apiClient.finance.raw()`); this
 * decrypts client-side with the unlocked vault DEK before anything is
 * shown, same trust boundary as the web app's `useFinanceData` hook —
 * just fetched once here instead of cached by TanStack Query (no
 * equivalent wired up yet; a straightforward addition later, not a
 * design gap).
 */
export default function TransactionsScreen() {
  const dek = useVaultStore((s) => s.dek);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dek) return;
    setError(null);
    try {
      const data = await apiClient.finance.raw();
      const [income, expenses, contributions] = await Promise.all([
        decryptIncomeRows(data.income, dek),
        decryptExpenseRows(data.expenses, dek),
        decryptContributionRows(data.contributions, dek),
      ]);
      setTransactions(computeTransactionsList(income.rows, expenses.rows, contributions.rows));
      setFailedCount(income.failedCount + expenses.failedCount + contributions.failedCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load transactions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dek]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
  }

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setFormVisible(true);
  }

  function openEdit(t: Transaction) {
    if (t.kind === "transfer") return;
    setEditing(t);
    setFormError(null);
    setFormVisible(true);
  }

  async function handleFormSubmit(values: TransactionFormValues) {
    setFormBusy(true);
    setFormError(null);
    const raw = {
      kind: values.kind,
      amount: values.amount,
      currency: "USD",
      date: values.date,
      description: values.description || null,
      isRecurring: false,
      frequency: "one_time" as const,
    };
    const result = editing
      ? await updateTransactionAction(editing.id, raw, dek)
      : await createTransactionAction(raw, dek);
    setFormBusy(false);
    if (!result.ok) {
      setFormError(result.error ?? "Something went wrong.");
      return;
    }
    setFormVisible(false);
    setEditing(null);
    load();
  }

  async function handleDelete(t: Transaction) {
    if (t.kind === "transfer") return;
    const result = await deleteTransactionAction(t.id, t.kind);
    if (result.ok) load();
  }

  if (!dek || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#8400ff" />
      </View>
    );
  }

  const summary = transactions ? summarize(transactions) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Transactions</Text>

      {summary && (
        <View style={styles.summaryRow}>
          <SummaryTile label="Income" value={summary.income} color="#4ade80" />
          <SummaryTile label="Expenses" value={summary.expenses} color="#f87171" />
          <SummaryTile label="Net" value={summary.net} color="#fff" />
        </View>
      )}

      {failedCount > 0 && (
        <Text style={styles.warning}>{failedCount} row(s) couldn't be decrypted.</Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={transactions ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8400ff" />}
        ListEmptyComponent={<Text style={styles.empty}>No transactions yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => openEdit(item)} onLongPress={() => handleDelete(item)}>
            <View style={styles.rowMain}>
              <Text style={styles.rowDescription} numberOfLines={1}>
                {item.description ?? item.categoryName ?? item.kind}
              </Text>
              <Text style={styles.rowDate}>{item.date}</Text>
            </View>
            <Text style={[styles.rowAmount, item.kind === "income" ? styles.income : styles.expense]}>
              {item.kind === "income" ? "+" : item.kind === "expense" ? "-" : ""}
              {formatCurrency(item.amount, item.currency)}
            </Text>
          </Pressable>
        )}
      />

      <Pressable style={styles.fab} onPress={openCreate}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <TransactionForm
        visible={formVisible}
        editing={editing}
        busy={formBusy}
        error={formError}
        onSubmit={handleFormSubmit}
        onClose={() => setFormVisible(false)}
      />
    </View>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{formatCurrency(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", paddingTop: 24 },
  centered: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginHorizontal: 20, marginBottom: 12 },
  summaryRow: { flexDirection: "row", gap: 8, marginHorizontal: 20, marginBottom: 12 },
  summaryTile: { flex: 1, backgroundColor: "#1a1a22", borderRadius: 10, padding: 10, gap: 2 },
  summaryLabel: { color: "#888", fontSize: 12 },
  summaryValue: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  warning: { color: "#fbbf24", marginHorizontal: 20, marginBottom: 8 },
  error: { color: "#f87171", marginHorizontal: 20, marginBottom: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  empty: { color: "#666", textAlign: "center", marginTop: 40 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a22",
  },
  rowMain: { flex: 1, marginRight: 12 },
  rowDescription: { color: "#fff", fontWeight: "500" },
  rowDate: { color: "#666", fontSize: 12, marginTop: 2 },
  rowAmount: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  income: { color: "#4ade80" },
  expense: { color: "#f87171" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#8400ff",
    alignItems: "center",
    justifyContent: "center",
  },
  fabText: { color: "#fff", fontSize: 28, lineHeight: 30 },
});
