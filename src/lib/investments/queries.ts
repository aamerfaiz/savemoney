import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDisplayCurrency } from "@/lib/profile/queries";
import { computeInvestmentProjection } from "@/lib/finance/investment";
import type { CurrencyCode } from "@/lib/format";
import { demoInvestments } from "./mock";
import type { InvestmentType, InvestmentWithProjection } from "./types";

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

interface InvestmentRow {
  id: string;
  name: string;
  type: string;
  invested_amount: string | number;
  current_value: string | number;
  monthly_contribution: string | number | null;
  expected_return: string | number;
  currency: string;
  start_date: string;
}

/** Holdings with gain/loss + future-value projections and portfolio totals. */
export async function getInvestmentsData(): Promise<InvestmentsData> {
  const currency = await getDisplayCurrency();
  const raw = isSupabaseConfigured() ? await fetchInvestments() : demoInvestments;
  // Display every holding in the user's base currency (no conversion yet).
  const investments = raw.map((i) => ({ ...i, currency }));

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

async function fetchInvestments(): Promise<InvestmentWithProjection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("investments")
    .select(
      "id, name, type, invested_amount, current_value, monthly_contribution, expected_return, currency, start_date",
    )
    .is("deleted_at", null)
    .order("current_value", { ascending: false });

  return ((data ?? []) as InvestmentRow[]).map(mapRow);
}

function mapRow(i: InvestmentRow): InvestmentWithProjection {
  const investedAmount = Number(i.invested_amount);
  const currentValue = Number(i.current_value);
  const monthlyContribution =
    i.monthly_contribution == null ? null : Number(i.monthly_contribution);
  const expectedReturn = Number(i.expected_return);

  const projection = computeInvestmentProjection({
    investedAmount,
    currentValue,
    monthlyContribution,
    expectedReturn,
    startDate: i.start_date,
  });

  return {
    id: i.id,
    name: i.name,
    type: i.type as InvestmentType,
    investedAmount,
    currentValue,
    monthlyContribution,
    expectedReturn,
    currency: (i.currency as CurrencyCode) ?? "USD",
    startDate: i.start_date,
    projection,
  };
}
