import { AnalyticsView } from "@/components/analytics/analytics-view";
import { getAnalyticsData } from "@/lib/analytics/queries";

export const metadata = { title: "Analytics · Finance OS" };

export default async function AnalyticsPage() {
  const data = await getAnalyticsData();

  return <AnalyticsView data={data} />;
}
