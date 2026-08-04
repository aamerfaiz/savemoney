import { z } from "zod";

import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { LoanProjection } from "@savemoney/finance-engine/loan";

export type LoanType =
  | "home"
  | "car"
  | "personal"
  | "education"
  | "credit_card"
  | "other";

export interface LoanWithProjection {
  id: string;
  name: string;
  type: LoanType;
  principal: number;
  interestRate: number;
  emi: number;
  remainingAmount: number;
  remainingMonths: number | null;
  extraEmi: number | null;
  currency: CurrencyCode;
  startDate: string;
  projection: LoanProjection;
}

export const LOAN_TYPES = [
  "home",
  "car",
  "personal",
  "education",
  "credit_card",
  "other",
] as const;

export const LOAN_TYPE_ICON: Record<LoanType, string> = {
  home: "home",
  car: "car",
  personal: "landmark",
  education: "graduation-cap",
  credit_card: "landmark",
  other: "landmark",
};

export const loanInputSchema = z.object({
  name: z.string().trim().min(1, "Give the loan a name").max(80),
  type: z.enum(LOAN_TYPES).default("personal"),
  principal: z.coerce.number().positive("Principal must be greater than zero"),
  interestRate: z.coerce
    .number()
    .min(0, "Rate can't be negative")
    .max(100, "That rate looks too high"),
  emi: z.coerce.number().positive("EMI must be greater than zero"),
  remainingAmount: z.coerce.number().min(0),
  remainingMonths: z.coerce.number().int().min(0).optional().nullable(),
  extraEmi: z.coerce.number().min(0).optional().nullable(),
  currency: z.string().length(3).default("USD"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
});

export type LoanInput = z.infer<typeof loanInputSchema>;

export const paymentInputSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isExtra: z.coerce.boolean().default(false),
});

export type PaymentInput = z.infer<typeof paymentInputSchema>;
