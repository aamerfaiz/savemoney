import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatPercent } from "@savemoney/finance-engine/format";

import { apiClient } from "../src/lib/api/client";
import {
  createInvestment as createInvestmentAction,
  deleteInvestment as deleteInvestmentAction,
  recordContribution as recordContributionAction,
} from "../src/lib/investments/client-actions";
import { computeInvestmentsData } from "../src/lib/investments/compute";
import type { InvestmentWithProjection } from "../src/lib/investments/types";
import { decryptInvestmentRows } from "../src/lib/finance/decrypt";
import { InvestmentContributionForm } from "../src/components/investment-contribution-form";
import { InvestmentForm } from "../src/components/investment-form";
import { useVaultStore } from "../src/lib/vault/store";

export default function InvestmentsScreen() {
  const dek = useVaultStore((s) => s.dek);
  const [investments, setInvestments] = useState<InvestmentWithProjection[] | null>(null);
  const [totals, setTotals] = useState<{ totalValue: number; totalGain: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [contributing, setContributing] = useState<InvestmentWithProjection | null>(null);
  const [contribBusy, setContribBusy] = useState(false);
  const [contribError, setContribError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dek) return;
    setError(null);
    try {
      const { investments: rawInvestments } = await apiClient.investments.list();
      const decrypted = await decryptInvestmentRows(rawInvestments, dek);
      const data = computeInvestmentsData(decrypted.rows, "USD");
      setInvestments(data.investments);
      setTotals({ totalValue: data.totalValue, totalGain: data.totalGain });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load investments.");
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
    investedAmount: string;
    currentValue: string;
    expectedReturn: string;
  }) {
    setFormBusy(true);
    setFormError(null);
    const result = await createInvestmentAction(
      {
        name: values.name,
        investedAmount: values.investedAmount,
        currentValue: values.currentValue,
        expectedReturn: values.expectedReturn,
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

  async function handleContribute(amount: string, addToValue: boolean) {
    if (!contributing) return;
    setContribBusy(true);
    setContribError(null);
    const result = await recordContributionAction(
      contributing,
      { amount, addToValue, contributedAt: new Date().toISOString().slice(0, 10) },
      dek,
    );
    setContribBusy(false);
    if (!result.ok) {
      setContribError(result.error ?? "Something went wrong.");
      return;
    }
    setContributing(null);
    load();
  }

  async function handleDelete(i: InvestmentWithProjection) {
    const result = await deleteInvestmentAction(i.id);
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
      {totals && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Total value</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totals.totalValue)}</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>Gain/loss</Text>
            <Text
              style={[
                styles.summaryValue,
                { color: totals.totalGain >= 0 ? "#4ade80" : "#f87171" },
              ]}
            >
              {totals.totalGain >= 0 ? "+" : ""}
              {formatCurrency(totals.totalGain)}
            </Text>
          </View>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={investments ?? []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8400ff" />}
        ListEmptyComponent={<Text style={styles.empty}>No investments yet.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => setContributing(item)}
            onLongPress={() => handleDelete(item)}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={[styles.rowGain, { color: item.projection.isUp ? "#4ade80" : "#f87171" }]}>
                {formatPercent(item.projection.returnPct)}
              </Text>
            </View>
            <Text style={styles.rowAmount}>{formatCurrency(item.currentValue, item.currency)}</Text>
            <Text style={styles.rowInvested}>
              Invested {formatCurrency(item.investedAmount, item.currency)}
            </Text>
          </Pressable>
        )}
      />

      <Pressable style={styles.fab} onPress={() => setFormVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <InvestmentForm
        visible={formVisible}
        busy={formBusy}
        error={formError}
        onSubmit={handleCreate}
        onClose={() => setFormVisible(false)}
      />
      <InvestmentContributionForm
        visible={!!contributing}
        label={contributing?.name ?? ""}
        busy={contribBusy}
        error={contribError}
        onSubmit={handleContribute}
        onClose={() => setContributing(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", paddingTop: 12 },
  centered: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center" },
  summaryRow: { flexDirection: "row", gap: 8, marginHorizontal: 20, marginTop: 12, marginBottom: 4 },
  summaryTile: { flex: 1, backgroundColor: "#1a1a22", borderRadius: 10, padding: 12, gap: 2 },
  summaryLabel: { color: "#888", fontSize: 12 },
  summaryValue: { color: "#fff", fontWeight: "700", fontSize: 18, fontVariant: ["tabular-nums"] },
  error: { color: "#f87171", marginHorizontal: 20, marginTop: 12 },
  list: { padding: 20, paddingBottom: 100, gap: 12 },
  empty: { color: "#666", textAlign: "center", marginTop: 40 },
  row: { backgroundColor: "#151519", borderRadius: 10, padding: 14, gap: 6 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between" },
  rowName: { color: "#fff", fontWeight: "600" },
  rowGain: { fontVariant: ["tabular-nums"], fontWeight: "600" },
  rowAmount: { color: "#fff", fontSize: 16, fontVariant: ["tabular-nums"] },
  rowInvested: { color: "#888", fontSize: 12 },
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
