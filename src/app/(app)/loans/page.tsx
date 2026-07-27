import { LoansView } from "@/components/loans/loans-view";
import { getLoansData } from "@/lib/loans/queries";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Loans · Finance OS" };

export default async function LoansPage() {
  const data = await getLoansData();

  return <LoansView data={data} readOnly={!isSupabaseConfigured()} />;
}
