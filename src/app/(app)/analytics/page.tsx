import { AnalyticsView } from "@/components/analytics/analytics-view";
import { getAnalyticsData } from "@/lib/analytics/queries";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Analytics · Finance OS" };

export default async function AnalyticsPage() {
  const data = await getAnalyticsData();

  return <AnalyticsView data={data} readOnly={!isSupabaseConfigured()} />;
}
