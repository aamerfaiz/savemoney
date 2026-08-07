import { AuthedCollectionDetailView } from "@/components/collections/authed-collection-detail-view";
import { getCategories, getAccounts } from "@/lib/transactions/reference";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Collection · Finance OS" };

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [categories, accounts, currency] = await Promise.all([
    getCategories(),
    getAccounts(),
    getDisplayCurrency(),
  ]);
  const expenseCategories = categories.filter((c) => c.kind === "expense");

  return (
    <AuthedCollectionDetailView
      collectionId={id}
      currency={currency}
      categories={categories}
      expenseCategories={expenseCategories}
      accounts={accounts}
    />
  );
}
