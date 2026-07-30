import { cookies } from "next/headers";

import { TransactionsView } from "@/components/transactions/transactions-view";
import { GuestTransactionsView } from "@/components/transactions/guest-transactions-view";
import { getTransactions, summarize } from "@/lib/transactions/queries";
import { getCategories, getAccounts } from "@/lib/transactions/reference";
import { getDisplayCurrency } from "@/lib/profile/queries";
import { GUEST_COOKIE } from "@/lib/guest/constants";
import type { TransactionFilter } from "@/lib/transactions/types";

export const metadata = { title: "Transactions · Finance OS" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: filterParam } = await searchParams;
  const filter: TransactionFilter =
    filterParam === "income" || filterParam === "expense" ? filterParam : "all";

  const cookieStore = await cookies();
  if (cookieStore.get(GUEST_COOKIE)?.value === "1") {
    return <GuestTransactionsView filter={filter} />;
  }

  const [transactions, categories, accounts, currency] = await Promise.all([
    getTransactions(filter),
    getCategories(),
    getAccounts(),
    getDisplayCurrency(),
  ]);

  const summary = summarize(transactions, currency);

  return (
    <TransactionsView
      transactions={transactions}
      summary={summary}
      categories={categories}
      accounts={accounts}
      filter={filter}
    />
  );
}
