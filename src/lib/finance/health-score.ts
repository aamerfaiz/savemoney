/**
 * Financial Health Score (0–100).
 *
 * A pure, testable function that combines the seven signals from the spec.
 * Each sub-score is 0–1; weights sum to 1. This is intentionally isolated
 * from any data source so it can be unit-tested and reused across the
 * dashboard, analytics and the what-if simulator later.
 */

export interface HealthInputs {
  /** savings / income for the period (0–1+) */
  savingsRate: number;
  /** liquid emergency fund expressed in months of expenses */
  emergencyFundMonths: number;
  /** total monthly debt payments / monthly income (0–1+) */
  debtRatio: number;
  /** investment contributions / income (0–1+) */
  investmentRate: number;
  /** share of budgeted categories kept within budget (0–1) */
  budgetDiscipline: number;
  /** stability of income across recent months (0–1) */
  incomeStability: number;
  /** share of active goals on track (0–1) */
  goalCompletion: number;
}

const WEIGHTS = {
  savingsRate: 0.22,
  emergencyFund: 0.18,
  debtRatio: 0.18,
  investmentRate: 0.14,
  budgetDiscipline: 0.12,
  incomeStability: 0.1,
  goalCompletion: 0.06,
} as const;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export interface HealthResult {
  score: number; // 0–100
  band: "critical" | "poor" | "fair" | "good" | "excellent";
  breakdown: Record<keyof typeof WEIGHTS, number>; // each 0–100
}

export function computeHealthScore(input: HealthInputs): HealthResult {
  const parts = {
    // 20% savings rate maps to a full sub-score.
    savingsRate: clamp01(input.savingsRate / 0.2),
    // 6 months emergency fund is a full sub-score.
    emergencyFund: clamp01(input.emergencyFundMonths / 6),
    // Lower debt is better; 0 debt = 1, >=50% income = 0.
    debtRatio: clamp01(1 - input.debtRatio / 0.5),
    // 15% invested maps to a full sub-score.
    investmentRate: clamp01(input.investmentRate / 0.15),
    budgetDiscipline: clamp01(input.budgetDiscipline),
    incomeStability: clamp01(input.incomeStability),
    goalCompletion: clamp01(input.goalCompletion),
  };

  const score = Math.round(
    (parts.savingsRate * WEIGHTS.savingsRate +
      parts.emergencyFund * WEIGHTS.emergencyFund +
      parts.debtRatio * WEIGHTS.debtRatio +
      parts.investmentRate * WEIGHTS.investmentRate +
      parts.budgetDiscipline * WEIGHTS.budgetDiscipline +
      parts.incomeStability * WEIGHTS.incomeStability +
      parts.goalCompletion * WEIGHTS.goalCompletion) *
      100,
  );

  const band: HealthResult["band"] =
    score >= 80
      ? "excellent"
      : score >= 65
        ? "good"
        : score >= 45
          ? "fair"
          : score >= 25
            ? "poor"
            : "critical";

  const breakdown = Object.fromEntries(
    Object.entries(parts).map(([k, v]) => [k, Math.round(v * 100)]),
  ) as HealthResult["breakdown"];

  return { score, band, breakdown };
}
