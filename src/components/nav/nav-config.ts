import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Target,
  Landmark,
  PieChart,
  Wallet,
  Settings,
  Upload,
  TrendingUp,
  Scale,
  Repeat,
  CalendarDays,
  Gauge,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Show in the mobile bottom bar (kept to 5 max for thumb reach). */
  primary?: boolean;
}

/**
 * Single source of truth for navigation. Phase 1 surfaces the modules that
 * exist; the rest are stubbed routes that render a "coming soon" placeholder.
 */
export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, primary: true },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight, primary: true },
  { label: "Budget", href: "/budget", icon: Wallet, primary: true },
  { label: "Goals", href: "/goals", icon: Target, primary: true },
  { label: "Loans", href: "/loans", icon: Landmark },
  { label: "Investments", href: "/investments", icon: TrendingUp },
  { label: "Net Worth", href: "/net-worth", icon: Scale },
  { label: "Recurring", href: "/recurring", icon: Repeat },
  { label: "Bill Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Analytics", href: "/analytics", icon: PieChart, primary: true },
  { label: "Financial Score", href: "/financial-score", icon: Gauge },
  { label: "Import", href: "/import", icon: Upload },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const primaryNavItems = navItems.filter((i) => i.primary);
