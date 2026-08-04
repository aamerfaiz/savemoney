import { AuthedLoansView } from "@/components/loans/authed-loans-view";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Loans · Finance OS" };

export default async function LoansPage() {
  const currency = await getDisplayCurrency();

  return <AuthedLoansView currency={currency} />;
}
