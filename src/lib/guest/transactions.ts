import type { ZodError } from "zod";

import type { CurrencyCode } from "@/lib/format";
import { setGuestTable } from "./db";
import { loadGuestData } from "./repo";
import {
  transactionInputSchema,
  type Transaction,
  type TransactionFilter,
  type TransactionKind,
} from "@/lib/transactions/types";
import type { ActionResult } from "@/lib/transactions/actions";

/**
 * Guest-mode equivalents of src/lib/transactions/actions.ts + queries.ts —
 * same signatures and same Zod validation, but reading/writing IndexedDB
 * instead of a Server Action hitting Postgres. useActionState doesn't care
 * whether the bound function is a Server Action, so these drop straight into
 * TransactionForm/TransactionsView in place of the real ones.
 */

export async function guestGetTransactions(
  filter: TransactionFilter = "all",
): Promise<Transaction[]> {
  const data = await loadGuestData();
  const rows =
    filter === "all"
      ? data.transactions
      : data.transactions.filter((t) => t.kind === filter);
  return [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function parseFormData(formData: FormData) {
  const raw = {
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "USD",
    date: formData.get("date"),
    categoryId: emptyToNull(formData.get("categoryId")),
    accountId: emptyToNull(formData.get("accountId")),
    description: emptyToNull(formData.get("description")),
    isRecurring:
      formData.get("isRecurring") === "on" || formData.get("isRecurring") === "true",
    frequency: formData.get("frequency") || "one_time",
    sourceType: formData.get("sourceType") || undefined,
    note: emptyToNull(formData.get("note")),
  };
  return transactionInputSchema.safeParse(raw);
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

function fieldErrors(err: ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
}

export async function guestCreateTransaction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseFormData(formData);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const data = await loadGuestData();
  const category = data.categories.find((c) => c.id === v.categoryId) ?? null;
  const account = data.accounts.find((a) => a.id === v.accountId) ?? null;

  const row: Transaction = {
    id: `guest-${crypto.randomUUID()}`,
    kind: v.kind,
    amount: v.amount,
    currency: v.currency as CurrencyCode,
    description: v.description ?? null,
    categoryId: v.categoryId ?? null,
    categoryName: category?.name ?? null,
    categoryIcon: category?.icon ?? null,
    accountId: v.accountId ?? null,
    accountName: account?.name ?? null,
    date: v.date,
    isRecurring: v.isRecurring,
    frequency: v.frequency,
    sourceType: v.kind === "income" ? v.sourceType : undefined,
    note: v.kind === "expense" ? (v.note ?? null) : undefined,
  };

  await setGuestTable("transactions", [row, ...data.transactions]);
  return { ok: true };
}

export async function guestUpdateTransaction(
  id: string,
  kind: TransactionKind,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseFormData(formData);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  const data = await loadGuestData();
  const category = data.categories.find((c) => c.id === v.categoryId) ?? null;
  const account = data.accounts.find((a) => a.id === v.accountId) ?? null;

  const next = data.transactions.map((t): Transaction =>
    t.id === id
      ? {
          ...t,
          kind,
          amount: v.amount,
          currency: v.currency as CurrencyCode,
          description: v.description ?? null,
          categoryId: v.categoryId ?? null,
          categoryName: category?.name ?? null,
          categoryIcon: category?.icon ?? null,
          accountId: v.accountId ?? null,
          accountName: account?.name ?? null,
          date: v.date,
          isRecurring: v.isRecurring,
          frequency: v.frequency,
          sourceType: kind === "income" ? v.sourceType : t.sourceType,
          note: kind === "expense" ? (v.note ?? null) : t.note,
        }
      : t,
  );

  await setGuestTable("transactions", next);
  return { ok: true };
}

export async function guestDeleteTransaction(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept to match deleteTransaction's signature
  _kind: TransactionKind,
): Promise<ActionResult> {
  const data = await loadGuestData();
  await setGuestTable(
    "transactions",
    data.transactions.filter((t) => t.id !== id),
  );
  return { ok: true };
}
