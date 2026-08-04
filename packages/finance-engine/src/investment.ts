/**
 * Investment gain/loss + future-value projection (pure).
 *
 * The Investments module tracks a holding at its cost basis (`investedAmount`)
 * and latest market value (`currentValue`). From those plus an expected annual
 * return and any recurring monthly contribution (SIP) we derive:
 *  - absolute and percentage gain/loss so far,
 *  - a simple annualized return that also credits ongoing contributions, and
 *  - a compounded future value at a horizon (this is the differentiator the
 *    spec asks for — "can I afford X in N years").
 *
 * Kept dependency-free so it runs in the dashboard, analytics and the future
 * what-if simulator without a database or a browser.
 */

const DEFAULT_HORIZON_YEARS = 10;

export interface InvestmentProjectionInput {
  /** Total amount put in so far (cost basis). */
  investedAmount: number;
  /** Latest market value of the holding. */
  currentValue: number;
  /** Recurring monthly top-up (SIP). Defaults to 0. */
  monthlyContribution?: number | null;
  /** Expected annual return as a percentage, e.g. 8 for 8%. */
  expectedReturn: number;
  /** Years to project forward. Defaults to 10. */
  horizonYears?: number;
  /** When the holding was opened — used to annualize the realized return. */
  startDate?: string | null;
}

export interface InvestmentProjection {
  /** currentValue − investedAmount (can be negative). */
  gain: number;
  /** gain / investedAmount, or 0 when nothing is invested. */
  returnPct: number;
  /** True when the holding is currently above its cost basis. */
  isUp: boolean;
  /** Approximate annualized return since `startDate` (0 when unknown/<1mo). */
  annualizedReturn: number;
  horizonYears: number;
  /** Compounded value at the horizon (current value grown + future SIPs). */
  projectedValue: number;
  /** Principal added between now and the horizon via monthly contributions. */
  projectedContributions: number;
  /** projectedValue − currentValue − projectedContributions (growth only). */
  projectedGain: number;
}

/** Months elapsed between an ISO date and `now` (fractional, min 0). */
function monthsSince(startDate: string, now: Date): number {
  const start = new Date(startDate + "T00:00:00");
  if (Number.isNaN(start.getTime())) return 0;
  const ms = now.getTime() - start.getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24 * 30.4375));
}

export function computeInvestmentProjection(
  input: InvestmentProjectionInput,
  now = new Date(),
): InvestmentProjection {
  const invested = Math.max(0, input.investedAmount);
  const current = Math.max(0, input.currentValue);
  const monthly = Math.max(0, input.monthlyContribution ?? 0);
  const horizonYears = input.horizonYears ?? DEFAULT_HORIZON_YEARS;

  const gain = current - invested;
  const returnPct = invested > 0 ? gain / invested : 0;

  // Annualize the realized return over the holding period when we know it.
  let annualizedReturn = 0;
  if (input.startDate && invested > 0 && current > 0) {
    const years = monthsSince(input.startDate, now) / 12;
    if (years >= 1 / 12) {
      annualizedReturn = Math.pow(current / invested, 1 / Math.max(years, 1e-6)) - 1;
    } else {
      annualizedReturn = returnPct; // too short to annualize meaningfully
    }
  }

  // Future value: grow the current balance at the expected rate and add a
  // monthly SIP compounded month over month.
  const monthlyRate = input.expectedReturn / 100 / 12;
  const n = Math.round(horizonYears * 12);
  const growthFactor = Math.pow(1 + monthlyRate, n);
  const grownCurrent = current * growthFactor;
  const grownSip =
    monthlyRate === 0
      ? monthly * n
      : monthly * ((growthFactor - 1) / monthlyRate);

  const projectedValue = grownCurrent + grownSip;
  const projectedContributions = monthly * n;
  const projectedGain = projectedValue - current - projectedContributions;

  return {
    gain,
    returnPct,
    isUp: gain >= 0,
    annualizedReturn,
    horizonYears,
    projectedValue,
    projectedContributions,
    projectedGain,
  };
}
