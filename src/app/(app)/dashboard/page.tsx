import { cookies } from "next/headers";

import { AuthedDashboard } from "@/components/dashboard/authed-dashboard";
import { GuestDashboard } from "@/components/dashboard/guest-dashboard";
import { getProfile } from "@/lib/profile/queries";
import { GUEST_COOKIE } from "@/lib/guest/constants";

export const metadata = { title: "Dashboard · Finance OS" };

export default async function DashboardPage() {
  const cookieStore = await cookies();
  if (cookieStore.get(GUEST_COOKIE)?.value === "1") {
    return <GuestDashboard />;
  }

  const profile = await getProfile();
  return <AuthedDashboard userName={profile.name} currency={profile.baseCurrency} />;
}
