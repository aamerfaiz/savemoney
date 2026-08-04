import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatPercent } from "@savemoney/finance-engine/format";

import { apiClient } from "../../src/lib/api/client";
import {
  createBudget as createBudgetAction,
  deleteBudget as deleteBudgetAction,
} from "../../src/lib/budgets/client-actions";
import { computeBudgetsData, type BudgetsData } from "../../src/lib/budgets/compute";
import type { BudgetWithProgress } from "../../src/lib/budgets/types";
import {
  decryptActiveGoals,
  decryptBudgetRows,
  decryptExpenseRows,
  decryptIncomeRows,
  decryptLoanAmounts,
  decryptInvestmentMonthlyContributions,
} from "../../src/lib/finance/decrypt";
import { BudgetForm } from "../../src/components/budget-form";
import { useVaultStore } from "../../src/lib/vault/store";

/** Phase 5.5c — reuses the same finance.raw() boundary Transactions
 * (Phase 5.5b) already fetches from; every module reads through it
 * rather than getting its own GET route (see the plan doc's rationale
 * on api-client's finance.raw()). */
export default function BudgetScreen() {
  const dek = useVaultStore((s) => s.dek);
  const [data, setData] = useState<BudgetsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dek) return;
    setError(null);
    try {
      const raw = await apiClient.finance.raw();
      const [income, expenses, budgets, activeGoals, loans, investmentContributions] = await Promise.all([
        decryptIncomeRows(raw.income, dek),
        decryptExpenseRows(raw.expenses, dek),
        decryptBudgetRows(raw.budgets, dek),
        decryptActiveGoals(raw.activeGoals, dek),
        decryptLoanAmounts(raw.loans, dek),
        decryptInvestmentMonthlyContributions(raw.investmentMonthlyContributions, dek),
      ]);
      setData(
        computeBudgetsData(
          expenses.rows,
          income.rows,
          budgets.rows,
          activeGoals.rows,
          loans.rows,
          investmentContributions.rows,
          "USD",
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load budgets.");
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

  async function handleCreate(values: { period: "weekly" | "monthly" | "yearly"; amount: string }) {
    setFormBusy(true);
    setFormError(null);
    const result = await createBudgetAction(
      {
        categoryId: null,
        period: values.period,
        amount: values.amount,
        currency: "USD",
        startsOn: new Date().toISOString().slice(0, 10),
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

  async function handleDelete(b: BudgetWithProgress) {
    const result = await deleteBudgetAction(b.id);
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
      <Text style={styles.title}>Budget</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {data && (
        <View style={styles.safeToSpendCard}>
          <Text style={styles.safeToSpendLabel}>Safe to spend / day</Text>
          <Text style={styles.safeToSpendValue}>
            {formatCurrency(data.safeToSpend.perRemainingDay, data.currency)}
          </Text>
          <Text style={styles.safeToSpendSub}>
            {formatCurrency(data.safeToSpend.remaining, data.currency)} left this month
            {data.safeToSpend.overspent ? " — over budget" : ""}
          </Text>
        </View>
      )}

      <FlatList
        data={data?.budgets ?? []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8400ff" />}
        ListEmptyComponent={<Text style={styles.empty}>No category budgets yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onLongPress={() => handleDelete(item)}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowName}>{item.categoryName ?? "Overall"}</Text>
              <Text style={styles.rowAmount}>
                {formatCurrency(item.spent, item.currency)} / {formatCurrency(item.amount, item.currency)}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, item.utilization * 100)}%`,
                    backgroundColor:
                      item.status === "over" ? "#f87171" : item.status === "warning" ? "#fbbf24" : "#4ade80",
                  },
                ]}
              />
            </View>
            <Text style={styles.rowUtilization}>{formatPercent(item.utilization)} used</Text>
          </Pressable>
        )}
      />

      <Pressable style={styles.fab} onPress={() => setFormVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <BudgetForm
        visible={formVisible}
        busy={formBusy}
        error={formError}
        onSubmit={handleCreate}
        onClose={() => setFormVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", paddingTop: 24 },
  centered: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginHorizontal: 20, marginBottom: 12 },
  error: { color: "#f87171", marginHorizontal: 20, marginBottom: 8 },
  safeToSpendCard: { backgroundColor: "#1a1a22", borderRadius: 12, padding: 16, marginHorizontal: 20, marginBottom: 16 },
  safeToSpendLabel: { color: "#888", fontSize: 12 },
  safeToSpendValue: { color: "#fff", fontSize: 28, fontWeight: "700", fontVariant: ["tabular-nums"] },
  safeToSpendSub: { color: "#888", marginTop: 4 },
  list: { paddingHorizontal: 20, paddingBottom: 100, gap: 12 },
  empty: { color: "#666", textAlign: "center", marginTop: 40 },
  row: { backgroundColor: "#151519", borderRadius: 10, padding: 14, gap: 8 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between" },
  rowName: { color: "#fff", fontWeight: "600" },
  rowAmount: { color: "#888", fontVariant: ["tabular-nums"] },
  progressTrack: { height: 6, backgroundColor: "#26262e", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  rowUtilization: { color: "#666", fontSize: 12 },
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
