import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { LoanType } from "./types";

/**
 * Packed-ciphertext row straight off the `loans` table (Phase 3.5.4, see
 * docs/e2ee-path-b-plan.md) — `principal`/`emi`/`remainingAmount`/
 * `extraEmi` need the vault DEK to read, so no computation (sorting,
 * projection, totals) happens here anymore, and the previous DB-level
 * `ORDER BY remaining_amount` is gone too (ciphertext sorts meaninglessly).
 * See src/lib/loans/compute.ts, which takes over once the client has
 * decrypted these via src/lib/finance/decrypt.ts's `decryptLoanRows`.
 */
export interface RawLoanRow {
  id: string;
  name: string;
  type: LoanType;
  principal: string;
  interestRate: number;
  emi: string;
  remainingAmount: string;
  remainingMonths: number | null;
  extraEmi: string | null;
  currency: string;
  startDate: string;
}

interface LoanSel {
  id: string;
  name: string;
  type: string;
  principal: string;
  interest_rate: string | number;
  emi: string;
  remaining_amount: string;
  remaining_months: number | null;
  extra_emi: string | null;
  currency: string;
  start_date: string;
}

export async function fetchLoansRaw(): Promise<RawLoanRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("loans")
    .select(
      "id, name, type, principal, interest_rate, emi, remaining_amount, remaining_months, extra_emi, currency, start_date",
    )
    .is("deleted_at", null);

  return ((data ?? []) as LoanSel[]).map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type as LoanType,
    principal: l.principal,
    interestRate: Number(l.interest_rate),
    emi: l.emi,
    remainingAmount: l.remaining_amount,
    remainingMonths: l.remaining_months,
    extraEmi: l.extra_emi,
    currency: l.currency,
    startDate: l.start_date,
  }));
}
