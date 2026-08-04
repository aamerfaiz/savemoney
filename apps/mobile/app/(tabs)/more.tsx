import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Landmark, TrendingUp } from "lucide-react-native";

/** Secondary modules, matching web's drawer contents for the same
 * non-primary set (Loans/Investments/Net Worth) — see
 * app/(tabs)/_layout.tsx's doc comment on why this is a tab for now
 * instead of a real drawer. */
export default function More() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>More</Text>
      <Link href="/loans" asChild>
        <Pressable style={styles.row}>
          <Landmark color="#a78bfa" size={20} />
          <Text style={styles.rowLabel}>Loans</Text>
          <ChevronRight color="#666" size={18} style={styles.chevron} />
        </Pressable>
      </Link>
      <Link href="/investments" asChild>
        <Pressable style={styles.row}>
          <TrendingUp color="#a78bfa" size={20} />
          <Text style={styles.rowLabel}>Investments</Text>
          <ChevronRight color="#666" size={18} style={styles.chevron} />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0f", paddingTop: 24 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginHorizontal: 20, marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a22",
  },
  rowLabel: { color: "#fff", fontSize: 15, flex: 1 },
  chevron: { marginLeft: "auto" },
});
