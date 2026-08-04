import { AuthedRecurringView } from "@/components/recurring/authed-recurring-view";
import { getCategories, getAccounts } from "@/lib/transactions/reference";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Recurring · Finance OS" };

export default async function RecurringPage() {
  const [categories, accounts, currency] = await Promise.all([
    getCategories(),
    getAccounts(),
    getDisplayCurrency(),
  ]);

  return (
    <AuthedRecurringView
      categories={categories}
      accounts={accounts}
      currency={currency}
    />
  );
}
