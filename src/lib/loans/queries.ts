import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { computeLoanProjection } from "@/lib/finance/loan";
import type { CurrencyCode } from "@/lib/format";
import { demoLoans } from "./mock";
import type { LoanType, LoanWithProjection } from "./types";

export interface LoansData {
  loans: LoanWithProjection[];
  totalRemaining: number;
  totalMonthlyEmi: number;
  totalInterestSaved: number;
  currency: CurrencyCode;
}

interface LoanRow {
  id: string;
  name: string;
  type: string;
  principal: string | number;
  interest_rate: string | number;
  emi: string | number;
  remaining_amount: string | number;
  remaining_months: number | null;
  extra_emi: string | number | null;
  currency: string;
  start_date: string;
}

/** Loans with amortization projections + portfolio totals. Demo fallback. */
export async function getLoansData(): Promise<LoansData> {
  const loans = isSupabaseConfigured() ? await fetchLoans() : demoLoans;

  const totalRemaining = loans.reduce((s, l) => s + l.remainingAmount, 0);
  const totalMonthlyEmi = loans.reduce(
    (s, l) => s + l.emi + (l.extraEmi ?? 0),
    0,
  );
  const totalInterestSaved = loans.reduce(
    (s, l) => s + l.projection.interestSaved,
    0,
  );

  return {
    loans,
    totalRemaining,
    totalMonthlyEmi,
    totalInterestSaved,
    currency: loans[0]?.currency ?? "USD",
  };
}

async function fetchLoans(): Promise<LoanWithProjection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("loans")
    .select(
      "id, name, type, principal, interest_rate, emi, remaining_amount, remaining_months, extra_emi, currency, start_date",
    )
    .is("deleted_at", null)
    .order("remaining_amount", { ascending: false });

  return ((data ?? []) as LoanRow[]).map(mapRow);
}

function mapRow(l: LoanRow): LoanWithProjection {
  const principal = Number(l.principal);
  const interestRate = Number(l.interest_rate);
  const emi = Number(l.emi);
  const remainingAmount = Number(l.remaining_amount);
  const extraEmi = l.extra_emi == null ? null : Number(l.extra_emi);

  const projection = computeLoanProjection({
    remainingAmount,
    interestRate,
    emi,
    extraEmi,
    principal,
  });

  return {
    id: l.id,
    name: l.name,
    type: l.type as LoanType,
    principal,
    interestRate,
    emi,
    remainingAmount,
    remainingMonths: l.remaining_months,
    extraEmi,
    currency: (l.currency as CurrencyCode) ?? "USD",
    startDate: l.start_date,
    projection,
  };
}
