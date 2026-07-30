import { BudgetsView } from "@/components/budgets/budgets-view";
import { getBudgetsData } from "@/lib/budgets/queries";
import { getCategories } from "@/lib/transactions/reference";

export const metadata = { title: "Budget · Finance OS" };

export default async function BudgetPage() {
  const [data, categories] = await Promise.all([
    getBudgetsData(),
    getCategories(),
  ]);

  return (
    <BudgetsView data={data} categories={categories} />
  );
}
