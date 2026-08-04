import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatPercent } from "@savemoney/finance-engine/format";

import { apiClient } from "../../src/lib/api/client";
import {
  addContribution as addContributionAction,
  createGoal as createGoalAction,
  deleteGoal as deleteGoalAction,
} from "../../src/lib/goals/client-actions";
import { computeGoalsData } from "../../src/lib/goals/compute";
import type { GoalWithProgress } from "../../src/lib/goals/types";
import { decryptGoalRows } from "../../src/lib/finance/decrypt";
import { ContributionForm } from "../../src/components/contribution-form";
import { GoalForm } from "../../src/components/goal-form";
import { useVaultStore } from "../../src/lib/vault/store";

export default function GoalsScreen() {
  const dek = useVaultStore((s) => s.dek);
  const [goals, setGoals] = useState<GoalWithProgress[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [contributing, setContributing] = useState<GoalWithProgress | null>(null);
  const [contribBusy, setContribBusy] = useState(false);
  const [contribError, setContribError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dek) return;
    setError(null);
    try {
      const { goals: rawGoals } = await apiClient.goals.list();
      const decrypted = await decryptGoalRows(rawGoals, dek);
      setGoals(computeGoalsData(decrypted.rows, "USD").goals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load goals.");
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
    targetAmount: string;
    currentAmount: string;
    deadline: string;
  }) {
    setFormBusy(true);
    setFormError(null);
    const result = await createGoalAction(
      {
        name: values.name,
        targetAmount: values.targetAmount,
        currentAmount: values.currentAmount || "0",
        currency: "USD",
        deadline: values.deadline || null,
        priority: "medium",
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

  async function handleContribute(amount: string) {
    if (!contributing) return;
    setContribBusy(true);
    setContribError(null);
    const result = await addContributionAction(
      contributing,
      { amount, contributedAt: new Date().toISOString().slice(0, 10) },
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

  async function handleDelete(g: GoalWithProgress) {
    const result = await deleteGoalAction(g.id);
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
      <Text style={styles.title}>Goals</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={goals ?? []}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8400ff" />}
        ListEmptyComponent={<Text style={styles.empty}>No goals yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => setContributing(item)} onLongPress={() => handleDelete(item)}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowStatus}>{item.status}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, item.projection.progress * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.rowAmount}>
              {formatCurrency(item.currentAmount, item.currency)} of{" "}
              {formatCurrency(item.targetAmount, item.currency)} ({formatPercent(item.projection.progress)})
            </Text>
            {item.deadline && <Text style={styles.rowDeadline}>Due {item.deadline}</Text>}
          </Pressable>
        )}
      />

      <Pressable style={styles.fab} onPress={() => setFormVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <GoalForm
        visible={formVisible}
        busy={formBusy}
        error={formError}
        onSubmit={handleCreate}
        onClose={() => setFormVisible(false)}
      />
      <ContributionForm
        visible={!!contributing}
        goalName={contributing?.name ?? ""}
        busy={contribBusy}
        error={contribError}
        onSubmit={handleContribute}
        onClose={() => setContributing(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", paddingTop: 24 },
  centered: { flex: 1, backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginHorizontal: 20, marginBottom: 12 },
  error: { color: "#f87171", marginHorizontal: 20, marginBottom: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 100, gap: 12 },
  empty: { color: "#666", textAlign: "center", marginTop: 40 },
  row: { backgroundColor: "#151519", borderRadius: 10, padding: 14, gap: 8 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between" },
  rowName: { color: "#fff", fontWeight: "600" },
  rowStatus: { color: "#888", fontSize: 12, textTransform: "capitalize" },
  progressTrack: { height: 6, backgroundColor: "#26262e", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: "#8400ff" },
  rowAmount: { color: "#888", fontSize: 12, fontVariant: ["tabular-nums"] },
  rowDeadline: { color: "#666", fontSize: 12 },
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
