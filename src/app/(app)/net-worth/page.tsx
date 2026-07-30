import { NetWorthView } from "@/components/networth/networth-view";
import { getNetWorthData } from "@/lib/networth/queries";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Net Worth · Finance OS" };

export default async function NetWorthPage() {
  const data = await getNetWorthData();

  return <NetWorthView data={data} readOnly={!isSupabaseConfigured()} />;
}
