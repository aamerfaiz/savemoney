import { BudgetsView } from "@/components/budgets/budgets-view";
import { getBudgetsData } from "@/lib/budgets/queries";
import { getCategories } from "@/lib/transactions/reference";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Budget · Finance OS" };

export default async function BudgetPage() {
  const [data, categories] = await Promise.all([
    getBudgetsData(),
    getCategories(),
  ]);

  return (
    <BudgetsView
      data={data}
      categories={categories}
      readOnly={!isSupabaseConfigured()}
    />
  );
}
