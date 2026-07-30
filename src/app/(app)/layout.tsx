import { cookies } from "next/headers";

import { Sidebar } from "@/components/nav/sidebar";
import { BottomNav } from "@/components/nav/bottom-nav";
import { TopBar } from "@/components/nav/top-bar";
import { getProfile } from "@/lib/profile/queries";
import { GUEST_COOKIE } from "@/lib/guest/constants";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isGuest = cookieStore.get(GUEST_COOKIE)?.value === "1";
  const profile = isGuest
    ? { name: "Guest", email: null, baseCurrency: "USD" as const, isReal: false }
    : await getProfile();

  return (
    <div className="flex min-h-dvh w-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userName={profile.name} isGuest={isGuest} />
        {/* Bottom padding clears the mobile tab bar */}
        <main className="flex-1 px-4 pb-28 pt-4 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
