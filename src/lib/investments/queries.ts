import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { InvestmentType } from "./types";

/**
 * Packed-ciphertext row straight off the `investments` table (Phase 3.5.4,
 * see docs/e2ee-path-b-plan.md) — `investedAmount`/`currentValue`/
 * `monthlyContribution` need the vault DEK to read, so no computation
 * (sorting, projection, totals) happens here anymore, and the previous
 * DB-level `ORDER BY current_value` is gone too (ciphertext sorts
 * meaninglessly). See src/lib/investments/compute.ts, which takes over once
 * the client has decrypted these via src/lib/finance/decrypt.ts's
 * `decryptInvestmentRows`.
 */
export interface RawInvestmentRow {
  id: string;
  name: string;
  type: InvestmentType;
  investedAmount: string;
  currentValue: string;
  monthlyContribution: string | null;
  expectedReturn: number;
  currency: string;
  startDate: string;
}

interface InvestmentSel {
  id: string;
  name: string;
  type: string;
  invested_amount: string;
  current_value: string;
  monthly_contribution: string | null;
  expected_return: string | number;
  currency: string;
  start_date: string;
}

export async function fetchInvestmentsRaw(): Promise<RawInvestmentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("investments")
    .select(
      "id, name, type, invested_amount, current_value, monthly_contribution, expected_return, currency, start_date",
    )
    .is("deleted_at", null);

  return ((data ?? []) as InvestmentSel[]).map((i) => ({
    id: i.id,
    name: i.name,
    type: i.type as InvestmentType,
    investedAmount: i.invested_amount,
    currentValue: i.current_value,
    monthlyContribution: i.monthly_contribution,
    expectedReturn: Number(i.expected_return),
    currency: i.currency,
    startDate: i.start_date,
  }));
}
