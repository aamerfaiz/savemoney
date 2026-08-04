import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatPercent } from "@savemoney/finance-engine/format";
import type { BudgetResult } from "@savemoney/finance-engine/budget";
import type { HealthResult } from "@savemoney/finance-engine/health-score";

import { apiClient } from "../../src/lib/api/client";
import { computeAnalyticsData } from "../../src/lib/analytics/compute";
import { computeBudgetsData } from "../../src/lib/budgets/compute";
import { computeGoalsData } from "../../src/lib/goals/compute";
import { computeInvestmentsData } from "../../src/lib/investments/compute";
import { computeLoansData } from "../../src/lib/loans/compute";
import { buildNetWorth } from "../../src/lib/networth/compute";
import { computeTransactionsList, summarize } from "../../src/lib/transactions/compute";
import type { Transaction } from "../../src/lib/transactions/types";
import {
  decryptActiveGoals,
  decryptBudgetRows,
  decryptContributionRows,
  decryptExpenseRows,
  decryptGoalRows,
  decryptIncomeRows,
  decryptInvestmentContributionRows,
  decryptInvestmentMonthlyContributions,
  decryptInvestmentRows,
  decryptLoanAmounts,
  decryptLoanRows,
  decryptSnapshotRows,
} from "../../src/lib/finance/decrypt";
import { supabase } from "../../src/lib/supabase/client";
import { useVaultStore } from "../../src/lib/vault/store";

interface DashboardSummary {
  monthlyIncome: number;
  monthlyExpenses: number;
  netWorth: number;
  netWorthChangePct: number;
  budget: BudgetResult;
  health: HealthResult;
  goals: { id: string; name: string; icon: string | null; saved: number; target: number }[];
  recent: Transaction[];
}

/**
 * Phase 5.5c — the capstone: composes every module built so far (Budget,
 * Goals, Loans, Investments, Net Worth, Analytics, Transactions). This is
 * NOT a port of apps/web/src/lib/dashboard/compute.ts's
 * `computeDashboardData()` — that function hard-requires `RecurringData`
 * for the "upcoming bills" card, and Recurring/Bill Calendar aren't in the
 * v1 mobile module list (docs/mobile-build-phase-plan.md §5 step 5 names
 * only the 8 modules built through this phase). Composing the same
 * building blocks directly here, minus that one card, is more honest than
 * fabricating fake recurring data just to satisfy a port's type
 * signature. Upcoming bills is a flagged omission, not silently dropped —
 * add it back if/when Recurring lands in a later phase.
 */
export default function Dashboard() {
  const dek = useVaultStore((s) => s.dek);
  const lock = useVaultStore((s) => s.lock);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const [
        income,
        expenses,
        budgets,
        activeGoals,
        loanAmounts,
        investmentMonthlyContribs,
        contributions,
        investmentContribs,
        goals,
        loans,
        investments,
        snapshots,
      ] = await Promise.all([
        decryptIncomeRows(raw.income, dek),
        decryptExpenseRows(raw.expenses, dek),
        decryptBudgetRows(raw.budgets, dek),
        decryptActiveGoals(raw.activeGoals, dek),
        decryptLoanAmounts(raw.loans, dek),
        decryptInvestmentMonthlyContributions(raw.investmentMonthlyContributions, dek),
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
      const budgetsData = computeBudgetsData(
        expenses.rows,
        income.rows,
        budgets.rows,
        activeGoals.rows,
        loanAmounts.rows,
        investmentMonthlyContribs.rows,
        "USD",
      );
      const goalsData = computeGoalsData(goals.rows, "USD");
      const loansData = computeLoansData(loans.rows, "USD");
      const investmentsData = computeInvestmentsData(investments.rows, "USD");
      const netWorth = buildNetWorth({
        components: {
          investmentsValue: investmentsData.totalValue,
          goalsSaved: goalsData.totalSaved,
          loansRemaining: loansData.totalRemaining,
        },
        months: analytics.months,
        snapshots: snapshots.rows,
        currency: "USD",
      });
      const transactions = computeTransactionsList(income.rows, expenses.rows, contributions.rows);
      const thisMonth = analytics.months[analytics.months.length - 1] ?? { income: 0, expenses: 0 };

      setSummary({
        monthlyIncome: thisMonth.income,
        monthlyExpenses: thisMonth.expenses,
        netWorth: netWorth.result.netWorth,
        netWorthChangePct: netWorth.changePct,
        budget: budgetsData.safeToSpend,
        health: analytics.health,
        goals: goalsData.goals
          .filter((g) => g.status === "active")
          .slice(0, 3)
          .map((g) => ({ id: g.id, name: g.name, icon: g.icon, saved: g.currentAmount, target: g.targetAmount })),
        recent: transactions.slice(0, 5),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the dashboard.");
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

  async function handleSignOut() {
    lock();
    await supabase.auth.signOut();
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
      <Text style={styles.title}>Dashboard</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {summary && (
        <>
          <View style={styles.tileRow}>
            <Tile label="Income" value={formatCurrency(summary.monthlyIncome)} color="#4ade80" />
            <Tile label="Expenses" value={formatCurrency(summary.monthlyExpenses)} color="#f87171" />
          </View>
          <View style={styles.tileRow}>
            <Tile label="Net worth" value={formatCurrency(summary.netWorth)} color="#fff" />
            <Tile
              label="Health score"
              value={`${Math.round(summary.health.score)} · ${summary.health.band}`}
              color="#a78bfa"
            />
          </View>

          <View style={styles.safeToSpendCard}>
            <Text style={styles.safeToSpendLabel}>Safe to spend / day</Text>
            <Text style={styles.safeToSpendValue}>{formatCurrency(summary.budget.perRemainingDay)}</Text>
            <Text style={styles.safeToSpendSub}>{formatCurrency(summary.budget.remaining)} left this month</Text>
          </View>

          {summary.goals.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Goals</Text>
              {summary.goals.map((g) => (
                <View key={g.id} style={styles.goalRow}>
                  <Text style={styles.goalName}>{g.name}</Text>
                  <Text style={styles.goalProgress}>
                    {formatCurrency(g.saved)} / {formatCurrency(g.target)} (
                    {formatPercent(g.target > 0 ? g.saved / g.target : 0)})
                  </Text>
                </View>
              ))}
            </>
          )}

          <Text style={styles.sectionTitle}>Recent transactions</Text>
          {summary.recent.length === 0 ? (
            <Text style={styles.empty}>No transactions yet.</Text>
          ) : (
            summary.recent.map((t) => (
              <View key={t.id} style={styles.txnRow}>
                <Text style={styles.txnDescription} numberOfLines={1}>
                  {t.description ?? t.categoryName ?? t.kind}
                </Text>
                <Text style={[styles.txnAmount, t.kind === "income" ? styles.income : styles.expense]}>
                  {t.kind === "income" ? "+" : t.kind === "expense" ? "-" : ""}
                  {formatCurrency(t.amount, t.currency)}
                </Text>
              </View>
            ))
          )}
        </>
      )}

      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Lock &amp; sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f" },
  centered: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center" },
  content: { padding: 20, paddingTop: 24, paddingBottom: 60, gap: 8 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 4 },
  error: { color: "#f87171", marginBottom: 8 },
  tileRow: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, backgroundColor: "#1a1a22", borderRadius: 10, padding: 12, gap: 2 },
  tileLabel: { color: "#888", fontSize: 12 },
  tileValue: { fontWeight: "700", fontSize: 16, fontVariant: ["tabular-nums"] },
  safeToSpendCard: { backgroundColor: "#151519", borderRadius: 12, padding: 16, marginTop: 4 },
  safeToSpendLabel: { color: "#888", fontSize: 12 },
  safeToSpendValue: { color: "#fff", fontSize: 24, fontWeight: "700", fontVariant: ["tabular-nums"] },
  safeToSpendSub: { color: "#888", marginTop: 2 },
  sectionTitle: { color: "#fff", fontWeight: "600", marginTop: 12, marginBottom: 4 },
  goalRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1a1a22" },
  goalName: { color: "#fff" },
  goalProgress: { color: "#888", fontSize: 12, marginTop: 2 },
  empty: { color: "#666" },
  txnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a22",
  },
  txnDescription: { color: "#fff", flex: 1, marginRight: 12 },
  txnAmount: { fontVariant: ["tabular-nums"], fontWeight: "600" },
  income: { color: "#4ade80" },
  expense: { color: "#f87171" },
  signOutButton: {
    marginTop: 24,
    backgroundColor: "#1a1a22",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  signOutText: { color: "#f87171", fontWeight: "600" },
});
