import { NotificationsView } from "@/components/notifications/notifications-view";
import { getNotificationsData } from "@/lib/notifications/queries";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata = { title: "Notifications · Finance OS" };

export default async function NotificationsPage() {
  const data = await getNotificationsData();
  return <NotificationsView data={data} readOnly={!isSupabaseConfigured()} />;
}
