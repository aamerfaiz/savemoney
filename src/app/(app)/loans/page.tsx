import { LoansView } from "@/components/loans/loans-view";
import { getLoansData } from "@/lib/loans/queries";

export const metadata = { title: "Loans · Finance OS" };

export default async function LoansPage() {
  const data = await getLoansData();

  return <LoansView data={data} />;
}
