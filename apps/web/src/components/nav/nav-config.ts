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
  FileText,
  Bell,
  Sparkles,
  HandCoins,
} from "lucide-react";

import { GUEST_ALLOWED_PATHS } from "@/lib/guest/constants";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Show in the mobile bottom bar (kept to 5 max for thumb reach). */
  primary?: boolean;
  /** Visually distinct center slot in the bottom bar (currently: AI). */
  accent?: boolean;
}

/**
 * Single source of truth for navigation. Phase 1 surfaces the modules that
 * exist; the rest are stubbed routes that render a "coming soon" placeholder.
 */
export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, primary: true },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight, primary: true },
  { label: "AI", href: "/ai", icon: Sparkles, primary: true, accent: true },
  { label: "Budget", href: "/budget", icon: Wallet },
  { label: "Goals", href: "/goals", icon: Target, primary: true },
  { label: "Loans", href: "/loans", icon: Landmark },
  { label: "Investments", href: "/investments", icon: TrendingUp },
  { label: "Net Worth", href: "/net-worth", icon: Scale },
  { label: "Recurring", href: "/recurring", icon: Repeat },
  { label: "Bill Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Collections", href: "/collections", icon: HandCoins, primary: true },
  { label: "Analytics", href: "/analytics", icon: PieChart },
  { label: "Financial Score", href: "/financial-score", icon: Gauge },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Import", href: "/import", icon: Upload },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const primaryNavItems = navItems.filter((i) => i.primary);

/** True for the handful of routes with real guest-mode (IndexedDB) support. */
export function isGuestVisible(item: NavItem): boolean {
  return GUEST_ALLOWED_PATHS.includes(item.href);
}

/**
 * Nav items to render for the given session kind. Guests only see the
 * routes that actually work without a real account (proxy.ts redirects them
 * away from the rest server-side too, so this is a UX filter, not the only
 * guard) — see src/lib/guest/constants.ts.
 */
export function visibleNavItems(items: NavItem[], isGuest: boolean): NavItem[] {
  return isGuest ? items.filter(isGuestVisible) : items;
}
