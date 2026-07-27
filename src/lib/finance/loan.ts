/**
 * Loan amortization + payoff projection (pure).
 *
 * Simulates paying down a balance at a fixed monthly payment to find how long
 * it takes and how much interest accrues. Comparing the base EMI against
 * EMI + extra EMI yields the interest saved and time saved from paying extra —
 * the numbers the spec asks the Loans module to surface.
 */

const MAX_MONTHS = 1200; // 100 years — guards against never-amortizing loans.

export interface PayoffResult {
  /** Months to clear the balance (null = payment never covers interest). */
  months: number | null;
  totalInterest: number;
  payoffDate: string | null; // ISO
}

export interface LoanProjectionInput {
  /** Current outstanding balance (this is also the foreclosure amount). */
  remainingAmount: number;
  /** Annual interest rate as a percentage, e.g. 8.5. */
  interestRate: number;
  /** Contractual monthly payment. */
  emi: number;
  /** Optional additional amount paid every month on top of the EMI. */
  extraEmi?: number | null;
  /** Original principal, for progress display. */
  principal?: number;
}

export interface LoanProjection {
  monthlyRate: number;
  foreclosureAmount: number;
  base: PayoffResult; // EMI only
  withExtra: PayoffResult; // EMI + extra
  interestSaved: number;
  monthsSaved: number;
  hasExtra: boolean;
  /** True when the EMI is too small to ever amortize the balance. */
  underwater: boolean;
  /** 0–1 share of the original principal already paid off (if principal known). */
  progress: number | null;
}

function addMonths(date: Date, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Simulate paying `payment`/month against `balance` at `monthlyRate`. */
export function simulatePayoff(
  balance: number,
  monthlyRate: number,
  payment: number,
  now = new Date(),
): PayoffResult {
  if (balance <= 0) {
    return { months: 0, totalInterest: 0, payoffDate: now.toISOString().slice(0, 10) };
  }
  // With interest, the payment must exceed the first month's interest.
  if (monthlyRate > 0 && payment <= balance * monthlyRate) {
    return { months: null, totalInterest: Infinity, payoffDate: null };
  }

  let b = balance;
  let months = 0;
  let totalInterest = 0;
  while (b > 0.005 && months < MAX_MONTHS) {
    const interest = b * monthlyRate;
    const principalPaid = Math.min(payment - interest, b);
    b -= principalPaid;
    totalInterest += interest;
    months += 1;
  }
  if (months >= MAX_MONTHS && b > 0.005) {
    return { months: null, totalInterest: Infinity, payoffDate: null };
  }
  return { months, totalInterest, payoffDate: addMonths(now, months) };
}

export function computeLoanProjection(
  input: LoanProjectionInput,
  now = new Date(),
): LoanProjection {
  const monthlyRate = input.interestRate / 100 / 12;
  const extra = Math.max(0, input.extraEmi ?? 0);
  const balance = input.remainingAmount;

  const base = simulatePayoff(balance, monthlyRate, input.emi, now);
  const withExtra =
    extra > 0
      ? simulatePayoff(balance, monthlyRate, input.emi + extra, now)
      : base;

  const underwater = base.months === null;

  const interestSaved =
    !underwater && base.months !== null && withExtra.months !== null
      ? Math.max(0, base.totalInterest - withExtra.totalInterest)
      : 0;
  const monthsSaved =
    !underwater && base.months !== null && withExtra.months !== null
      ? Math.max(0, base.months - withExtra.months)
      : 0;

  const progress =
    input.principal && input.principal > 0
      ? Math.min(1, Math.max(0, (input.principal - balance) / input.principal))
      : null;

  return {
    monthlyRate,
    foreclosureAmount: balance,
    base,
    withExtra,
    interestSaved,
    monthsSaved,
    hasExtra: extra > 0,
    underwater,
    progress,
  };
}

/** Standard EMI for a fresh loan — handy when the user doesn't know it. */
export function estimateEmi(
  principal: number,
  interestRate: number,
  months: number,
): number {
  const r = interestRate / 100 / 12;
  if (months <= 0) return principal;
  if (r === 0) return principal / months;
  const factor = Math.pow(1 + r, months);
  return (principal * r * factor) / (factor - 1);
}
