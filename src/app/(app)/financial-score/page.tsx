import { FinancialScoreView } from "@/components/score/financial-score-view";
import { getScoreData } from "@/lib/score/queries";

export const metadata = { title: "Financial Score · Finance OS" };

export default async function FinancialScorePage() {
  const data = await getScoreData();
  return <FinancialScoreView data={data} />;
}
