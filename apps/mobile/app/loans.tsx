import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatPercent } from "@savemoney/finance-engine/format";

import { apiClient } from "../src/lib/api/client";
import {
  createLoan as createLoanAction,
  deleteLoan as deleteLoanAction,
  recordPayment as recordPaymentAction,
} from "../src/lib/loans/client-actions";
import { computeLoansData } from "../src/lib/loans/compute";
import type { LoanWithProjection } from "../src/lib/loans/types";
import { decryptLoanRows } from "../src/lib/finance/decrypt";
import { LoanForm } from "../src/components/loan-form";
import { PaymentForm } from "../src/components/payment-form";
import { useVaultStore } from "../src/lib/vault/store";

export default function LoansScreen() {
  const dek = useVaultStore((s) => s.dek);
  const [loans, setLoans] = useState<LoanWithProjection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [paying, setPaying] = useState<LoanWithProjection | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dek) return;
    setError(null);
    try {
      const { loans: rawLoans } = await apiClient.loans.list();
      const decrypted = await decryptLoanRows(rawLoans, dek);
      setLoans(computeLoansData(decrypted.rows, "USD").loans);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load loans.");
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

  async function handleCreate(values: {
    name: string;
    principal: string;
    interestRate: string;
    emi: string;
    remainingAmount: string;
  }) {
    setFormBusy(true);
    setFormError(null);
    const result = await createLoanAction(
      {
        name: values.name,
        principal: values.principal,
        interestRate: values.interestRate,
        emi: values.emi,
        remainingAmount: values.remainingAmount,
        currency: "USD",
        startDate: new Date().toISOString().slice(0, 10),
      },
      dek,
    );
    setFormBusy(false);
    if (!result.ok) {
      setFormError(result.error ?? "Something went wrong.");
      return;
    }
    setFormVisible(false);
    load();
  }

  async function handlePay(amount: string, isExtra: boolean) {
    if (!paying) return;
    setPayBusy(true);
    setPayError(null);
    const result = await recordPaymentAction(paying, { amount, isExtra }, dek);
    setPayBusy(false);
    if (!result.ok) {
      setPayError(result.error ?? "Something went wrong.");
      return;
    }
    setPaying(null);
    load();
  }

  async function handleDelete(l: LoanWithProjection) {
    const result = await deleteLoanAction(l.id);
    if (result.ok) load();
  }

  if (!dek || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#8400ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={loans ?? []}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8400ff" />}
        ListEmptyComponent={<Text style={styles.empty}>No loans yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => setPaying(item)} onLongPress={() => handleDelete(item)}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowRate}>{item.interestRate}% APR</Text>
            </View>
            <Text style={styles.rowAmount}>
              {formatCurrency(item.remainingAmount, item.currency)} remaining
            </Text>
            <Text style={styles.rowEmi}>
              EMI {formatCurrency(item.emi, item.currency)}
              {item.extraEmi ? ` + ${formatCurrency(item.extraEmi, item.currency)} extra` : ""}
            </Text>
            {item.projection.hasExtra && (
              <Text style={styles.rowSaved}>
                Extra payments save {formatCurrency(item.projection.interestSaved, item.currency)}
                {item.projection.progress != null
                  ? ` (${formatPercent(item.projection.progress)} paid off)`
                  : ""}
              </Text>
            )}
          </Pressable>
        )}
      />

      <Pressable style={styles.fab} onPress={() => setFormVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <LoanForm
        visible={formVisible}
        busy={formBusy}
        error={formError}
        onSubmit={handleCreate}
        onClose={() => setFormVisible(false)}
      />
      <PaymentForm
        visible={!!paying}
        loanName={paying?.name ?? ""}
        busy={payBusy}
        error={payError}
        onSubmit={handlePay}
        onClose={() => setPaying(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  centered: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center" },
  error: { color: "#f87171", marginHorizontal: 20, marginTop: 12, marginBottom: 8 },
  list: { padding: 20, paddingBottom: 100, gap: 12 },
  empty: { color: "#666", textAlign: "center", marginTop: 40 },
  row: { backgroundColor: "#151519", borderRadius: 10, padding: 14, gap: 6 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between" },
  rowName: { color: "#fff", fontWeight: "600" },
  rowRate: { color: "#888", fontSize: 12 },
  rowAmount: { color: "#fff", fontVariant: ["tabular-nums"] },
  rowEmi: { color: "#888", fontSize: 12 },
  rowSaved: { color: "#4ade80", fontSize: 12 },
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
