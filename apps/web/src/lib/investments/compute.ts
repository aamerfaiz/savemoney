/**
 * Pure investments computation (Phase 3.5.4) — the projection/totals logic
 * that used to live in getInvestmentsData(), unchanged, now taking
 * already-decrypted rows instead of fetching+decrypting itself. No I/O, no
 * "server-only" — callable from client code, which is where it now has to
 * run since only the browser (vault unlocked) can decrypt investment
 * amounts. The old DB-level `ORDER BY current_value` moves to a
 * client-side sort here too — a ciphertext column sorts meaninglessly. See
 * src/lib/goals/compute.ts / src/lib/loans/compute.ts for the identical
 * pattern already applied to goals/loans.
 */

import { computeInvestmentProjection } from "@savemoney/finance-engine/investment";
import type { CurrencyCode } from "@/lib/format";
import type { DecryptedInvestmentRow } from "@/lib/finance/decrypt";
import type { InvestmentWithProjection } from "./types";

export interface InvestmentsData {
  investments: InvestmentWithProjection[];
  totalValue: number;
  totalInvested: number;
  totalGain: number;
  /** Sum of monthly SIP contributions — feeds safe-to-spend. */
  monthlyContribution: number;
  /** Compounded portfolio value at the projection horizon. */
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
        // Display every holding in the user's base currency (no conversion yet).
        currency,
        startDate: i.startDate,
        projection,
      };
    })
    .sort((a, b) => b.currentValue - a.currentValue);

  const totalValue = investments.reduce((s, i) => s + i.currentValue, 0);
  const totalInvested = investments.reduce((s, i) => s + i.investedAmount, 0);
  const totalGain = totalValue - totalInvested;
  const monthlyContribution = investments.reduce(
    (s, i) => s + (i.monthlyContribution ?? 0),
    0,
  );
  const projectedValue = investments.reduce(
    (s, i) => s + i.projection.projectedValue,
    0,
  );

  return {
    investments,
    totalValue,
    totalInvested,
    totalGain,
    monthlyContribution,
    projectedValue,
    currency,
  };
}
