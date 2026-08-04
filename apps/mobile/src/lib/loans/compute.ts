/** Direct port of apps/web/src/lib/loans/compute.ts — pure, unchanged. */

import { computeLoanProjection } from "@savemoney/finance-engine/loan";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { DecryptedLoanRow } from "../finance/decrypt";
import type { LoanWithProjection } from "./types";

export interface LoansData {
  loans: LoanWithProjection[];
  totalRemaining: number;
  totalMonthlyEmi: number;
  totalInterestSaved: number;
  currency: CurrencyCode;
}

export function computeLoansData(
  rows: DecryptedLoanRow[],
  currency: CurrencyCode,
  now = new Date(),
): LoansData {
  const loans: LoanWithProjection[] = rows
    .map((l) => {
      const projection = computeLoanProjection(
        {
          remainingAmount: l.remainingAmount,
          interestRate: l.interestRate,
          emi: l.emi,
          extraEmi: l.extraEmi,
        },
        now,
      );
      return {
        id: l.id,
        name: l.name,
        type: l.type,
        principal: l.principal,
        interestRate: l.interestRate,
        emi: l.emi,
        remainingAmount: l.remainingAmount,
        remainingMonths: l.remainingMonths,
        extraEmi: l.extraEmi,
        currency,
        startDate: l.startDate,
        projection,
      };
    })
    .sort((a, b) => b.remainingAmount - a.remainingAmount);

  const totalRemaining = loans.reduce((s, l) => s + l.remainingAmount, 0);
  const totalMonthlyEmi = loans.reduce((s, l) => s + l.emi + (l.extraEmi ?? 0), 0);
  const totalInterestSaved = loans.reduce((s, l) => s + l.projection.interestSaved, 0);

  return { loans, totalRemaining, totalMonthlyEmi, totalInterestSaved, currency };
}
