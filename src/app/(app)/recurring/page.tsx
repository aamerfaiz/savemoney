import { RecurringView } from "@/components/recurring/recurring-view";
import { getRecurringData } from "@/lib/recurring/queries";
import { getCategories, getAccounts } from "@/lib/transactions/reference";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Recurring · Finance OS" };

export default async function RecurringPage() {
  const [data, categories, accounts] = await Promise.all([
    getRecurringData(),
    getCategories(),
    getAccounts(),
  ]);

  return (
    <RecurringView
      data={data}
      categories={categories}
      accounts={accounts}
      readOnly={!isSupabaseConfigured()}
    />
  );
}
