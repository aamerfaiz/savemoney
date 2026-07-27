import { TransactionsView } from "@/components/transactions/transactions-view";
import { getTransactions, summarize } from "@/lib/transactions/queries";
import { getCategories, getAccounts } from "@/lib/transactions/reference";
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

  const [transactions, categories, accounts] = await Promise.all([
    getTransactions(filter),
    getCategories(),
    getAccounts(),
  ]);

  const summary = summarize(transactions);

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
