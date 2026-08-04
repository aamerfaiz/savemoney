import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatPercent } from "@savemoney/finance-engine/format";

import { apiClient } from "../src/lib/api/client";
import { computeAnalyticsData } from "../src/lib/analytics/compute";
import { computeGoalsData } from "../src/lib/goals/compute";
import { computeInvestmentsData } from "../src/lib/investments/compute";
import { computeLoansData } from "../src/lib/loans/compute";
import { buildNetWorth } from "../src/lib/networth/compute";
import { captureSnapshot as captureSnapshotAction } from "../src/lib/networth/client-actions";
import type { NetWorthData } from "../src/lib/networth/types";
import {
  decryptActiveGoals,
  decryptContributionRows,
  decryptExpenseRows,
  decryptGoalRows,
  decryptIncomeRows,
  decryptInvestmentContributionRows,
  decryptInvestmentRows,
  decryptLoanAmounts,
  decryptLoanRows,
  decryptSnapshotRows,
} from "../src/lib/finance/decrypt";
import { useVaultStore } from "../src/lib/vault/store";

/** Phase 5.5c — the heaviest read composition so far: net worth is
 * assets/liabilities across Investments + Goals + Loans, so this pulls
 * from all three modules' own full-list routes, plus finance.raw() for
 * the trend-fallback month data (mirroring Analytics), plus its own
 * snapshots route. Matches web's own dashboard/net-worth composition,
 * which pulls from the same sources. */
export default function NetWorthScreen() {
  const dek = useVaultStore((s) => s.dek);
  const [data, setData] = useState<NetWorthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dek) return;
    setError(null);
    try {
      const [raw, { goals: rawGoals }, { loans: rawLoans }, { investments: rawInvestments }, { snapshots: rawSnapshots }] =
        await Promise.all([
          apiClient.finance.raw(),
          apiClient.goals.list(),
          apiClient.loans.list(),
          apiClient.investments.list(),
          apiClient.netWorth.snapshots(),
        ]);

      const [income, expenses, activeGoals, loanAmounts, contributions, investmentContribs, goals, loans, investments, snapshots] =
        await Promise.all([
          decryptIncomeRows(raw.income, dek),
          decryptExpenseRows(raw.expenses, dek),
          decryptActiveGoals(raw.activeGoals, dek),
          decryptLoanAmounts(raw.loans, dek),
          decryptContributionRows(raw.contributions, dek),
          decryptInvestmentContributionRows(raw.investmentContributions, dek),
          decryptGoalRows(rawGoals, dek),
          decryptLoanRows(rawLoans, dek),
          decryptInvestmentRows(rawInvestments, dek),
          decryptSnapshotRows(rawSnapshots, dek),
        ]);

      const analytics = computeAnalyticsData(
        income.rows,
        expenses.rows,
        activeGoals.rows,
        loanAmounts.rows,
        contributions.rows,
        investmentContribs.rows,
        "USD",
      );
      const goalsData = computeGoalsData(goals.rows, "USD");
      const loansData = computeLoansData(loans.rows, "USD");
      const investmentsData = computeInvestmentsData(investments.rows, "USD");

      setData(
        buildNetWorth({
          components: {
            investmentsValue: investmentsData.totalValue,
            goalsSaved: goalsData.totalSaved,
            loansRemaining: loansData.totalRemaining,
          },
          months: analytics.months,
          snapshots: snapshots.rows,
          currency: "USD",
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load net worth.");
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

  async function handleCapture() {
    if (!data) return;
    setCapturing(true);
    setCaptureMessage(null);
    const result = await captureSnapshotAction(data.result, dek);
    setCapturing(false);
    setCaptureMessage(result.ok ? "Snapshot saved." : result.error ?? "Something went wrong.");
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8400ff" />}
    >
      {error && <Text style={styles.error}>{error}</Text>}

      {data && (
        <>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Net worth</Text>
            <Text style={styles.cardValue}>{formatCurrency(data.result.netWorth, data.currency)}</Text>
            <Text style={[styles.cardChange, { color: data.change >= 0 ? "#4ade80" : "#f87171" }]}>
              {data.change >= 0 ? "+" : ""}
              {formatCurrency(data.change, data.currency)} ({formatPercent(data.changePct)})
            </Text>
          </View>

          <View style={styles.breakdownRow}>
            <View style={styles.breakdownTile}>
              <Text style={styles.breakdownLabel}>Assets</Text>
              <Text style={[styles.breakdownValue, { color: "#4ade80" }]}>
                {formatCurrency(data.result.totalAssets, data.currency)}
              </Text>
            </View>
            <View style={styles.breakdownTile}>
              <Text style={styles.breakdownLabel}>Liabilities</Text>
              <Text style={[styles.breakdownValue, { color: "#f87171" }]}>
                {formatCurrency(data.result.totalLiabilities, data.currency)}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Breakdown</Text>
          {[...data.result.assets, ...data.result.liabilities].map((b) => (
            <View key={b.key} style={styles.breakdownRowItem}>
              <Text style={styles.breakdownItemLabel}>{b.label}</Text>
              <Text style={styles.breakdownItemValue}>{formatCurrency(b.amount, data.currency)}</Text>
            </View>
          ))}

          <Pressable style={styles.captureButton} onPress={handleCapture} disabled={capturing}>
            {capturing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.captureButtonText}>Save today's snapshot</Text>
            )}
          </Pressable>
          {captureMessage && <Text style={styles.captureMessage}>{captureMessage}</Text>}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  centered: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center" },
  content: { padding: 20, paddingBottom: 60, gap: 8 },
  error: { color: "#f87171", marginBottom: 8 },
  card: { backgroundColor: "#1a1a22", borderRadius: 12, padding: 20, alignItems: "center", marginBottom: 12 },
  cardLabel: { color: "#888", fontSize: 12 },
  cardValue: { color: "#fff", fontSize: 32, fontWeight: "700", fontVariant: ["tabular-nums"] },
  cardChange: { fontVariant: ["tabular-nums"], marginTop: 4 },
  breakdownRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  breakdownTile: { flex: 1, backgroundColor: "#151519", borderRadius: 10, padding: 12, gap: 2 },
  breakdownLabel: { color: "#888", fontSize: 12 },
  breakdownValue: { fontWeight: "700", fontVariant: ["tabular-nums"] },
  sectionTitle: { color: "#fff", fontWeight: "600", marginBottom: 8 },
  breakdownRowItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a22",
  },
  breakdownItemLabel: { color: "#ccc" },
  breakdownItemValue: { color: "#fff", fontVariant: ["tabular-nums"] },
  captureButton: {
    backgroundColor: "#8400ff",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  captureButtonText: { color: "#fff", fontWeight: "600" },
  captureMessage: { color: "#888", textAlign: "center", marginTop: 8 },
});
