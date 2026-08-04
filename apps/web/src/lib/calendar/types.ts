import type { CurrencyCode } from "@savemoney/finance-engine/format";

export type BillSourceKind = "recurring" | "loan";

/** A single dated money event on the bill calendar. */
export interface BillOccurrence {
  /** Stable per-occurrence id: `${sourceKind}:${sourceId}:${dueDate}`. */
  id: string;
  sourceId: string;
  sourceKind: BillSourceKind;
  title: string;
  /** Positive magnitude; `kind` says whether it flows in or out. */
  amount: number;
  kind: "bill" | "emi" | "income";
  /** ISO yyyy-mm-dd. */
  dueDate: string;
  icon: string;
  currency: CurrencyCode;
}
