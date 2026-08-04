import { AuthedNetWorth } from "@/components/networth/authed-networth";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Net Worth · Finance OS" };

export default async function NetWorthPage() {
  const currency = await getDisplayCurrency();
  return <AuthedNetWorth currency={currency} />;
}
