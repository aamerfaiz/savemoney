import { ReportsView } from "@/components/reports/reports-view";
import { getReportsData } from "@/lib/reports/queries";

export const metadata = { title: "Reports · Finance OS" };

export default async function ReportsPage() {
  const data = await getReportsData();
  return <ReportsView data={data} />;
}
