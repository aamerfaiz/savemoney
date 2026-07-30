import { NetWorthView } from "@/components/networth/networth-view";
import { getNetWorthData } from "@/lib/networth/queries";

export const metadata = { title: "Net Worth · Finance OS" };

export default async function NetWorthPage() {
  const data = await getNetWorthData();

  return <NetWorthView data={data} />;
}
