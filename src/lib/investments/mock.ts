import { computeInvestmentProjection } from "@/lib/finance/investment";
import type { InvestmentType, InvestmentWithProjection } from "./types";

/** Demo holdings so the page renders without a configured backend. */
export const demoInvestments: InvestmentWithProjection[] = [
  mk("Index Fund SIP", "mutual_fund", 24000, 31200, 500, 10, "2021-01-15"),
  mk("Tech Stocks", "stocks", 15000, 21800, 300, 12, "2022-04-01"),
  mk("Government Bonds", "bonds", 12000, 12900, 0, 6, "2023-02-10"),
  mk("Bitcoin", "crypto", 5000, 8600, 100, 15, "2023-08-20"),
  mk("Gold ETF", "gold", 8000, 9100, 0, 5, "2022-11-05"),
];

function mk(
  name: string,
  type: InvestmentType,
  invested: number,
  current: number,
  monthly: number,
  expectedReturn: number,
  startDate: string,
): InvestmentWithProjection {
  const projection = computeInvestmentProjection({
    investedAmount: invested,
    currentValue: current,
    monthlyContribution: monthly,
    expectedReturn,
    startDate,
  });
  return {
    id: `demo-${name}`,
    name,
    type,
    investedAmount: invested,
    currentValue: current,
    monthlyContribution: monthly || null,
    expectedReturn,
    currency: "USD",
    startDate,
    projection,
  };
}
