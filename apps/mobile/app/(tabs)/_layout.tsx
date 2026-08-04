import { Tabs } from "expo-router";
import { ArrowLeftRight, LayoutDashboard, MoreHorizontal, PieChart, Target, Wallet } from "lucide-react-native";

/**
 * Primary bottom tabs (Phase 5.5a) — the same 5 the web app's bottom bar
 * shows (`nav-config.ts`'s `primary` items), minus AI: AI isn't in the
 * v1 mobile module list at all (docs/mobile-build-phase-plan.md §5 step
 * 5 names Transactions/Dashboard/Budget/Goals/Loans/Investments/Net
 * Worth/Analytics — no AI Assistant for v1).
 *
 * "More" (added when Loans landed) is the 6th tab and a deliberate
 * deviation from the 5-max/thumb-reach rule: web reaches its secondary
 * modules (Loans/Investments/Net Worth) via a top-left drawer, not a 6th
 * bottom-bar item, but building an equivalent drawer wasn't worth doing
 * for one link yet. Revisit once all three secondary modules are in
 * (More's list will be long enough to justify a real drawer then).
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#a78bfa",
        tabBarInactiveTintColor: "#666",
        tabBarStyle: { backgroundColor: "#0b0b0f", borderTopColor: "#1a1a22" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="transactions"
        options={{ title: "Transactions", tabBarIcon: ({ color, size }) => <ArrowLeftRight color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="budget"
        options={{ title: "Budget", tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="goals"
        options={{ title: "Goals", tabBarIcon: ({ color, size }) => <Target color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="analytics"
        options={{ title: "Analytics", tabBarIcon: ({ color, size }) => <PieChart color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: "More", tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} /> }}
      />
    </Tabs>
  );
}
