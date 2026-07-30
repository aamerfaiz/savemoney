import { cookies } from "next/headers";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { GuestDashboard } from "@/components/dashboard/guest-dashboard";
import { getDashboardData } from "@/lib/dashboard/queries";
import { GUEST_COOKIE } from "@/lib/guest/constants";

export const metadata = { title: "Dashboard · Finance OS" };

export default async function DashboardPage() {
  const cookieStore = await cookies();
  if (cookieStore.get(GUEST_COOKIE)?.value === "1") {
    return <GuestDashboard />;
  }

  const d = await getDashboardData();
  return <DashboardView d={d} />;
}
