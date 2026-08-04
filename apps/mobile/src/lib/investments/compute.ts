/** Direct port of apps/web/src/lib/investments/compute.ts — pure, unchanged. */

import { computeInvestmentProjection } from "@savemoney/finance-engine/investment";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { DecryptedInvestmentRow } from "../finance/decrypt";
import type { InvestmentWithProjection } from "./types";

export interface InvestmentsData {
  investments: InvestmentWithProjection[];
  totalValue: number;
  totalInvested: number;
  totalGain: number;
  monthlyContribution: number;
  projectedValue: number;
  currency: CurrencyCode;
}

export function computeInvestmentsData(
  rows: DecryptedInvestmentRow[],
  currency: CurrencyCode,
  now = new Date(),
): InvestmentsData {
  const investments: InvestmentWithProjection[] = rows
    .map((i) => {
      const projection = computeInvestmentProjection(
        {
          investedAmount: i.investedAmount,
          currentValue: i.currentValue,
          monthlyContribution: i.monthlyContribution,
          expectedReturn: i.expectedReturn,
          startDate: i.startDate,
        },
        now,
      );
      return {
        id: i.id,
        name: i.name,
        type: i.type,
        investedAmount: i.investedAmount,
        currentValue: i.currentValue,
        monthlyContribution: i.monthlyContribution,
        expectedReturn: i.expectedReturn,
        currency,
        startDate: i.startDate,
        projection,
      };
    })
    .sort((a, b) => b.currentValue - a.currentValue);

  const totalValue = investments.reduce((s, i) => s + i.currentValue, 0);
  const totalInvested = investments.reduce((s, i) => s + i.investedAmount, 0);
  const totalGain = totalValue - totalInvested;
  const monthlyContribution = investments.reduce((s, i) => s + (i.monthlyContribution ?? 0), 0);
  const projectedValue = investments.reduce((s, i) => s + i.projection.projectedValue, 0);

  return { investments, totalValue, totalInvested, totalGain, monthlyContribution, projectedValue, currency };
}
