import { AuthedCollectionsView } from "@/components/collections/authed-collections-view";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Collections · Finance OS" };

export default async function CollectionsPage() {
  const currency = await getDisplayCurrency();

  return <AuthedCollectionsView currency={currency} />;
}
