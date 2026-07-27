import { computeLoanProjection } from "@/lib/finance/loan";
import type { LoanType, LoanWithProjection } from "./types";

/** Demo loans so the page renders without a configured backend. */
export const demoLoans: LoanWithProjection[] = [
  mk("Home Loan", "home", 220000, 145000, 6.5, 1650, 200, "2020-03-01"),
  mk("Car Loan", "car", 28000, 12400, 8.9, 560, 0, "2023-06-15"),
  mk("Education Loan", "education", 40000, 9800, 5.0, 420, 0, "2019-09-01"),
];

function mk(
  name: string,
  type: LoanType,
  principal: number,
  remaining: number,
  rate: number,
  emi: number,
  extra: number,
  startDate: string,
): LoanWithProjection {
  const projection = computeLoanProjection({
    remainingAmount: remaining,
    interestRate: rate,
    emi,
    extraEmi: extra,
    principal,
  });
  return {
    id: `demo-${name}`,
    name,
    type,
    principal,
    interestRate: rate,
    emi,
    remainingAmount: remaining,
    remainingMonths: projection.base.months,
    extraEmi: extra || null,
    currency: "USD",
    startDate,
    projection,
  };
}
