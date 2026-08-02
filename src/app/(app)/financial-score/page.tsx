import { AuthedScore } from "@/components/score/authed-score";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Financial Score · Finance OS" };

export default async function FinancialScorePage() {
  const currency = await getDisplayCurrency();
  return <AuthedScore currency={currency} />;
}
