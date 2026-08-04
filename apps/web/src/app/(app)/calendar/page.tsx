import { AuthedCalendarView } from "@/components/calendar/authed-calendar-view";
import { getDisplayCurrency } from "@/lib/profile/queries";

export const metadata = { title: "Bill calendar · Finance OS" };

export default async function CalendarPage() {
  const currency = await getDisplayCurrency();

  return <AuthedCalendarView currency={currency} />;
}
