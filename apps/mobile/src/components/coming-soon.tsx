import { StyleSheet, Text, View } from "react-native";

/** Mirrors apps/web/src/components/coming-soon.tsx — placeholder for a
 * routed-but-not-yet-built module (see docs/mobile-build-phase-plan.md
 * §5 step 5's module order: Transactions first, then Dashboard, Budget,
 * Goals, Loans, Investments, Net Worth, Analytics). */
export function ComingSoon({ title, phase = "Phase 5.5" }: { title: string; phase?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{title} is on the roadmap</Text>
        <Text style={styles.cardBody}>
          The {title} module is scaffolded and coming in {phase}.
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{phase}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", padding: 20, paddingTop: 24 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 16 },
  card: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#333",
    borderRadius: 12,
    paddingVertical: 48,
    alignItems: "center",
    gap: 8,
  },
  cardTitle: { color: "#fff", fontWeight: "600" },
  cardBody: { color: "#888", textAlign: "center", maxWidth: 260 },
  badge: { backgroundColor: "#1a1a22", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  badgeText: { color: "#888", fontSize: 12 },
});
