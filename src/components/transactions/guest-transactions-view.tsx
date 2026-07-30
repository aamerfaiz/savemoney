"use client";

import { useCallback, useEffect, useState } from "react";

import {
  PageHeaderSkeleton,
  RowsSkeleton,
  StatTilesSkeleton,
} from "@/components/skeletons";
import { TransactionsView } from "./transactions-view";
import {
  guestCreateTransaction,
  guestDeleteTransaction,
  guestGetTransactions,
  guestUpdateTransaction,
} from "@/lib/guest/transactions";
import { loadGuestData } from "@/lib/guest/repo";
import type { CurrencyCode } from "@/lib/format";
import type {
  Transaction,
  TransactionFilter,
  TransactionKind,
  TransactionSummary,
} from "@/lib/transactions/types";
import type { CategoryOption, AccountOption } from "@/lib/transactions/reference";
import type { ActionResult } from "@/lib/transactions/actions";

function summarizeGuest(
  transactions: Transaction[],
  currency: CurrencyCode,
): TransactionSummary {
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (t.kind === "income") income += t.amount;
    else if (t.kind === "expense") expenses += t.amount;
  }
  return { income, expenses, net: income - expenses, currency, count: transactions.length };
}

/** Guest-mode transactions: same UI + full add/edit/delete, all against
 *  IndexedDB. Every mutation reloads the local list afterward since there's
 *  no server render to refresh against. */
export function GuestTransactionsView({ filter }: { filter: TransactionFilter }) {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");

  const reload = useCallback(async () => {
    const [txns, data] = await Promise.all([
      guestGetTransactions(filter),
      loadGuestData(),
    ]);
    setTransactions(txns);
    setCategories(data.categories);
    setAccounts(data.accounts);
    setCurrency(data.profile.baseCurrency);
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([guestGetTransactions(filter), loadGuestData()]).then(
      ([txns, data]) => {
        if (cancelled) return;
        setTransactions(txns);
        setCategories(data.categories);
        setAccounts(data.accounts);
        setCurrency(data.profile.baseCurrency);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const createAction = useCallback(
    async (prev: ActionResult | undefined, formData: FormData) => {
      const result = await guestCreateTransaction(prev, formData);
      if (result.ok) await reload();
      return result;
    },
    [reload],
  );

  const updateAction = useCallback(
    async (
      id: string,
      kind: TransactionKind,
      prev: ActionResult | undefined,
      formData: FormData,
    ) => {
      const result = await guestUpdateTransaction(id, kind, prev, formData);
      if (result.ok) await reload();
      return result;
    },
    [reload],
  );

  const deleteAction = useCallback(
    async (id: string, kind: TransactionKind) => {
      const result = await guestDeleteTransaction(id, kind);
      await reload();
      return result;
    },
    [reload],
  );

  if (!transactions) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeaderSkeleton />
        <StatTilesSkeleton count={3} className="grid-cols-3" />
        <RowsSkeleton rows={6} />
      </div>
    );
  }

  return (
    <TransactionsView
      transactions={transactions}
      summary={summarizeGuest(transactions, currency)}
      categories={categories}
      accounts={accounts}
      filter={filter}
      readOnly={false}
      createAction={createAction}
      updateAction={updateAction}
      deleteAction={deleteAction}
    />
  );
}
