import { GoalsView } from "@/components/goals/goals-view";
import { getGoalsData } from "@/lib/goals/queries";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Goals · Finance OS" };

export default async function GoalsPage() {
  const data = await getGoalsData();

  return <GoalsView data={data} readOnly={!isSupabaseConfigured()} />;
}
