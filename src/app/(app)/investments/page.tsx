import { InvestmentsView } from "@/components/investments/investments-view";
import { getInvestmentsData } from "@/lib/investments/queries";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Investments · Finance OS" };

export default async function InvestmentsPage() {
  const data = await getInvestmentsData();

  return <InvestmentsView data={data} readOnly={!isSupabaseConfigured()} />;
}
