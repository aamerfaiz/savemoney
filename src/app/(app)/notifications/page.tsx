import { AuthedNotifications } from "@/components/notifications/authed-notifications";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Notifications · Finance OS" };

export default async function NotificationsPage() {
  const currency = await getDisplayCurrency();
  return <AuthedNotifications currency={currency} />;
}
