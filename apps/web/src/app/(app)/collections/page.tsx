import { AuthedCollectionsView } from "@/components/collections/authed-collections-view";
import { getCategories, getAccounts } from "@/lib/transactions/reference";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Collections · Finance OS" };

export default async function CollectionsPage() {
  const [categories, accounts, currency] = await Promise.all([
    getCategories(),
    getAccounts(),
    getDisplayCurrency(),
  ]);
  const expenseCategories = categories.filter((c) => c.kind === "expense");

  return (
    <AuthedCollectionsView
      currency={currency}
      expenseCategories={expenseCategories}
      accounts={accounts}
    />
  );
}
