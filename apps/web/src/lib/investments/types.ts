import { z } from "zod";

import type { CurrencyCode } from "@savemoney/finance-engine/format";
import type { InvestmentProjection } from "@savemoney/finance-engine/investment";

export type InvestmentType =
  | "stocks"
  | "mutual_fund"
  | "etf"
  | "bonds"
  | "crypto"
  | "real_estate"
  | "gold"
  | "retirement"
  | "other";

export interface InvestmentWithProjection {
  id: string;
  name: string;
  type: InvestmentType;
  investedAmount: number;
  currentValue: number;
  monthlyContribution: number | null;
  expectedReturn: number;
  currency: CurrencyCode;
  startDate: string;
  projection: InvestmentProjection;
}

export const INVESTMENT_TYPES = [
  "stocks",
  "mutual_fund",
  "etf",
  "bonds",
  "crypto",
  "real_estate",
  "gold",
  "retirement",
  "other",
] as const;

export const INVESTMENT_TYPE_ICON: Record<InvestmentType, string> = {
  stocks: "trending-up",
  mutual_fund: "chart-pie",
  etf: "layers",
  bonds: "scroll",
  crypto: "bitcoin",
  real_estate: "building-2",
  gold: "gem",
  retirement: "piggy-bank",
  other: "shapes",
};

export const INVESTMENT_TYPE_LABEL: Record<InvestmentType, string> = {
  stocks: "Stocks",
  mutual_fund: "Mutual fund",
  etf: "ETF",
  bonds: "Bonds",
  crypto: "Crypto",
  real_estate: "Real estate",
  gold: "Gold",
  retirement: "Retirement",
  other: "Other",
};

export const investmentInputSchema = z.object({
  name: z.string().trim().min(1, "Give the investment a name").max(80),
  type: z.enum(INVESTMENT_TYPES).default("stocks"),
  investedAmount: z.coerce
    .number()
    .min(0, "Invested amount can't be negative"),
  currentValue: z.coerce.number().min(0, "Value can't be negative"),
  monthlyContribution: z.coerce.number().min(0).optional().nullable(),
  expectedReturn: z.coerce
    .number()
    .min(0, "Rate can't be negative")
    .max(100, "That rate looks too high"),
  currency: z.string().length(3).default("USD"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
});

export type InvestmentInput = z.infer<typeof investmentInputSchema>;

export const contributionInputSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  /** Bump the holding's current value by the same amount when true. */
  addToValue: z.coerce.boolean().default(true),
  contributedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ContributionInput = z.infer<typeof contributionInputSchema>;
