import { AuthedBudgetsView } from "@/components/budgets/authed-budgets-view";
import { getCategories } from "@/lib/transactions/reference";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Budget · Finance OS" };

export default async function BudgetPage() {
  const [categories, currency] = await Promise.all([
    getCategories(),
    getDisplayCurrency(),
  ]);

  return <AuthedBudgetsView categories={categories} currency={currency} />;
}
