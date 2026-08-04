import { AuthedReports } from "@/components/reports/authed-reports";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Reports · Finance OS" };

export default async function ReportsPage() {
  const currency = await getDisplayCurrency();
  return <AuthedReports currency={currency} />;
}
