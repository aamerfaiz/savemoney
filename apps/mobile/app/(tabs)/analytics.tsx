import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatPercent } from "@savemoney/finance-engine/format";

import { apiClient } from "../../src/lib/api/client";
import { computeAnalyticsData } from "../../src/lib/analytics/compute";
import type { AnalyticsData } from "../../src/lib/analytics/types";
import {
  decryptActiveGoals,
  decryptContributionRows,
  decryptExpenseRows,
  decryptIncomeRows,
  decryptInvestmentContributionRows,
  decryptLoanAmounts,
} from "../../src/lib/finance/decrypt";
import { useVaultStore } from "../../src/lib/vault/store";

/** Phase 5.5c — no new Route Handler (reuses finance.raw()) and no
 * charting library: bars are plain Views sized by relative height,
 * matching the "re-implement behavior, not the exact chrome" approach
 * used for every screen so far (web uses Recharts, which has no RN
 * runtime). */
export default function AnalyticsScreen() {
  const dek = useVaultStore((s) => s.dek);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dek) return;
    setError(null);
    try {
      const raw = await apiClient.finance.raw();
      const [income, expenses, activeGoals, loans, contributions, investmentContributions] =
        await Promise.all([
          decryptIncomeRows(raw.income, dek),
          decryptExpenseRows(raw.expenses, dek),
          decryptActiveGoals(raw.activeGoals, dek),
          decryptLoanAmounts(raw.loans, dek),
          decryptContributionRows(raw.contributions, dek),
          decryptInvestmentContributionRows(raw.investmentContributions, dek),
        ]);
      setData(
        computeAnalyticsData(
          income.rows,
          expenses.rows,
          activeGoals.rows,
          loans.rows,
          contributions.rows,
          investmentContributions.rows,
          "USD",
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load analytics.");
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

  if (!dek || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#8400ff" />
      </View>
    );
  }

  const maxMonthly = data ? Math.max(...data.months.map((m) => Math.max(m.income, m.expenses)), 1) : 1;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8400ff" />}
    >
      <Text style={styles.title}>Analytics</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {data && (
        <>
          <View style={styles.healthCard}>
            <Text style={styles.healthLabel}>Financial health</Text>
            <Text style={styles.healthScore}>{Math.round(data.health.score)}</Text>
            <Text style={styles.healthBand}>{data.health.band}</Text>
          </View>

          <Text style={styles.sectionTitle}>Last 6 months</Text>
          <View style={styles.chart}>
            {data.months.map((m) => (
              <View key={m.key} style={styles.chartColumn}>
                <View style={styles.barPair}>
                  <View
                    style={[
                      styles.bar,
                      styles.incomeBar,
                      { height: Math.max(4, (m.income / maxMonthly) * 100) },
                    ]}
                  />
                  <View
                    style={[
                      styles.bar,
                      styles.expenseBar,
                      { height: Math.max(4, (m.expenses / maxMonthly) * 100) },
                    ]}
                  />
                </View>
                <Text style={styles.chartLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#4ade80" }]} />
              <Text style={styles.legendLabel}>Income</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#f87171" }]} />
              <Text style={styles.legendLabel}>Expenses</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Spending by category</Text>
          {data.byCategory.length === 0 ? (
            <Text style={styles.empty}>No expenses in this window.</Text>
          ) : (
            data.byCategory.slice(0, 8).map((c) => (
              <View key={c.category} style={styles.categoryRow}>
                <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                <Text style={styles.categoryLabel}>{c.category}</Text>
                <Text style={styles.categoryAmount}>{formatCurrency(c.amount, data.currency)}</Text>
              </View>
            ))
          )}

          <View style={styles.summaryRow}>
            <SummaryTile label="Savings rate" value={formatPercent(data.totals.savingsRate)} />
            <SummaryTile label="Avg. monthly spend" value={formatCurrency(data.totals.avgMonthlyExpense, data.currency)} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  centered: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center" },
  content: { padding: 20, paddingTop: 24, paddingBottom: 60, gap: 8 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 4 },
  error: { color: "#f87171", marginBottom: 8 },
  healthCard: { backgroundColor: "#1a1a22", borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 12 },
  healthLabel: { color: "#888", fontSize: 12 },
  healthScore: { color: "#fff", fontSize: 36, fontWeight: "700", fontVariant: ["tabular-nums"] },
  healthBand: { color: "#a78bfa", textTransform: "capitalize" },
  sectionTitle: { color: "#fff", fontWeight: "600", marginTop: 16, marginBottom: 8 },
  chart: { flexDirection: "row", justifyContent: "space-between", height: 120, alignItems: "flex-end" },
  chartColumn: { alignItems: "center", flex: 1 },
  barPair: { flexDirection: "row", gap: 3, alignItems: "flex-end", height: 100 },
  bar: { width: 8, borderRadius: 3 },
  incomeBar: { backgroundColor: "#4ade80" },
  expenseBar: { backgroundColor: "#f87171" },
  chartLabel: { color: "#666", fontSize: 10, marginTop: 4 },
  legendRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: "#888", fontSize: 12 },
  empty: { color: "#666" },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  categoryLabel: { color: "#fff", flex: 1 },
  categoryAmount: { color: "#888", fontVariant: ["tabular-nums"] },
  summaryRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  summaryTile: { flex: 1, backgroundColor: "#1a1a22", borderRadius: 10, padding: 12, gap: 2 },
  summaryLabel: { color: "#888", fontSize: 12 },
  summaryValue: { color: "#fff", fontWeight: "700" },
});
