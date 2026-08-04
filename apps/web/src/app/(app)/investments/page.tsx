import { AuthedInvestmentsView } from "@/components/investments/authed-investments-view";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Investments · Finance OS" };

export default async function InvestmentsPage() {
  const currency = await getDisplayCurrency();

  return <AuthedInvestmentsView currency={currency} />;
}
