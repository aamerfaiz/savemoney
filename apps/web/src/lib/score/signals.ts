import { WEIGHTS, type HealthSignal } from "@/lib/finance/health-score";

export interface SignalMeta {
  key: HealthSignal;
  label: string;
  /** What the signal measures, in one line. */
  description: string;
  /** Actionable nudge shown when the sub-score is low. */
  tip: string;
  /** Deep link to the module that moves this signal. */
  href: string;
  icon: string;
  weight: number;
}

const META: Record<HealthSignal, Omit<SignalMeta, "key" | "weight">> = {
  savingsRate: {
    label: "Savings rate",
    description: "Share of income you keep each month.",
    tip: "Aim to save 20% of income — trim a recurring expense or lift a goal contribution.",
    href: "/budget",
    icon: "piggy-bank",
  },
  emergencyFund: {
    label: "Emergency fund",
    description: "Months of expenses you could cover from savings.",
    tip: "Build toward 6 months of expenses in an accessible account.",
    href: "/goals",
    icon: "shield",
  },
  debtRatio: {
    label: "Debt load",
    description: "Monthly loan payments against your income.",
    tip: "Keep debt payments under 50% of income — an extra EMI shortens payoff fast.",
    href: "/loans",
    icon: "landmark",
  },
  investmentRate: {
    label: "Investing",
    description: "Share of income you invest for the future.",
    tip: "Automate a monthly SIP — even 10% of income compounds meaningfully.",
    href: "/investments",
    icon: "trending-up",
  },
  budgetDiscipline: {
    label: "Budget discipline",
    description: "How well you stay within category budgets.",
    tip: "Set limits on your top spending categories and review them weekly.",
    href: "/budget",
    icon: "wallet",
  },
  incomeStability: {
    label: "Income stability",
    description: "How steady your income is month to month.",
    tip: "Smooth lumpy income by setting aside more in high-earning months.",
    href: "/transactions",
    icon: "briefcase",
  },
  goalCompletion: {
    label: "Goals on track",
    description: "Share of active goals meeting their pace.",
    tip: "Raise contributions or extend deadlines so goals stay on pace.",
    href: "/goals",
    icon: "target",
  },
};

/** Signal metadata ordered by weight (most important first). */
export const SIGNALS: SignalMeta[] = (
  Object.keys(META) as HealthSignal[]
)
  .map((key) => ({ key, weight: WEIGHTS[key], ...META[key] }))
  .sort((a, b) => b.weight - a.weight);

/** A sub-score's qualitative band (drives color + copy). */
export function signalStatus(score: number): "strong" | "fair" | "weak" {
  if (score >= 67) return "strong";
  if (score >= 40) return "fair";
  return "weak";
}

/** One-line verdict for the overall band. */
export const BAND_VERDICT: Record<string, string> = {
  excellent: "Your finances are in great shape — keep the habits going.",
  good: "Solid footing. A few tweaks would push you into excellent.",
  fair: "A reasonable base with clear room to improve.",
  poor: "Some fundamentals need attention — start with the weakest signals.",
  critical: "Focus here: small consistent changes will move this quickly.",
};
