import { cookies } from "next/headers";

import { AuthedTransactionsView } from "@/components/transactions/authed-transactions-view";
import { GuestTransactionsView } from "@/components/transactions/guest-transactions-view";
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

  // Reference data only — categories/accounts/currency aren't encrypted,
  // safe to keep server-rendering. The transaction rows themselves need
  // the vault unlocked, so that fetch+decrypt happens client-side; see
  // AuthedTransactionsView.
  const [categories, accounts, currency] = await Promise.all([
    getCategories(),
    getAccounts(),
    getDisplayCurrency(),
  ]);

  return (
    <AuthedTransactionsView
      categories={categories}
      accounts={accounts}
      currency={currency}
      filter={filter}
    />
  );
}
