import { AuthedGoalsView } from "@/components/goals/authed-goals-view";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Goals · Finance OS" };

export default async function GoalsPage() {
  const currency = await getDisplayCurrency();

  return <AuthedGoalsView currency={currency} />;
}
