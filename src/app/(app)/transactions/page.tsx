import { TransactionsView } from "@/components/transactions/transactions-view";
import { getTransactions, summarize } from "@/lib/transactions/queries";
import { getCategories, getAccounts } from "@/lib/transactions/reference";
import { getDisplayCurrency } from "@/lib/profile/queries";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
      readOnly={!isSupabaseConfigured()}
    />
  );
}
