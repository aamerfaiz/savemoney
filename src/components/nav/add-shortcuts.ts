import {
  ArrowLeftRight,
  Landmark,
  Repeat,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { GUEST_ALLOWED_PATHS } from "@/lib/guest/constants";

export interface AddShortcut {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Quick-create destinations for the top bar's Add button and the command
 * palette's "Add" results — every module with a create flow, `?new=1`
 * appended so the destination page auto-opens its own add dialog (see
 * `useAutoOpenAdd`) instead of just landing on the list. */
export const ADD_SHORTCUTS: AddShortcut[] = [
  { label: "Transaction", href: "/transactions", icon: ArrowLeftRight },
  { label: "Budget", href: "/budget", icon: Wallet },
  { label: "Goal", href: "/goals", icon: Target },
  { label: "Loan", href: "/loans", icon: Landmark },
  { label: "Investment", href: "/investments", icon: TrendingUp },
  { label: "Recurring rule", href: "/recurring", icon: Repeat },
];

/** Guests only have real data support for Transactions — everything else
 * 404s server-side, mirroring nav-config.ts's `isGuestVisible`. */
export function visibleAddShortcuts(isGuest: boolean): AddShortcut[] {
  return isGuest
    ? ADD_SHORTCUTS.filter((s) => GUEST_ALLOWED_PATHS.includes(s.href))
    : ADD_SHORTCUTS;
}
