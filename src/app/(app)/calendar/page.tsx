import { BillCalendarView } from "@/components/calendar/bill-calendar-view";
import { getBillCalendarData } from "@/lib/calendar/queries";

export const metadata = { title: "Bill calendar · Finance OS" };

export default async function CalendarPage() {
  const data = await getBillCalendarData();
  return <BillCalendarView data={data} />;
}
