import { AuthedAnalyticsView } from "@/components/analytics/authed-analytics-view";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Analytics · Finance OS" };

export default async function AnalyticsPage() {
  const currency = await getDisplayCurrency();
  return <AuthedAnalyticsView currency={currency} />;
}
