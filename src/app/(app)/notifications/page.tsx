import { NotificationsView } from "@/components/notifications/notifications-view";
import { getNotificationsData } from "@/lib/notifications/queries";

export const metadata = { title: "Notifications · Finance OS" };

export default async function NotificationsPage() {
  const data = await getNotificationsData();
  return <NotificationsView data={data} />;
}
