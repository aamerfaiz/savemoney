/**
 * Pure loans computation (Phase 3.5.4) — the projection/totals logic that
 * used to live in getLoansData(), unchanged, now taking already-decrypted
 * rows instead of fetching+decrypting itself. No I/O, no "server-only" —
 * callable from client code, which is where it now has to run since only
 * the browser (vault unlocked) can decrypt loan amounts. The old DB-level
 * `ORDER BY remaining_amount` moves to a client-side sort here too — a
 * ciphertext column sorts meaninglessly. See src/lib/goals/compute.ts for
 * the identical pattern already applied to goals.
 */

import { computeLoanProjection } from "@savemoney/finance-engine/loan";
import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { DecryptedLoanRow } from "@/lib/finance/decrypt";
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
        // Display every loan in the user's base currency (no conversion yet).
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
