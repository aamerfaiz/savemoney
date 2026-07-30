"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exitGuestMode } from "@/lib/guest/session";

export function ExitGuestButton() {
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      size="sm"
      className="gap-1.5"
      onClick={async () => {
        await exitGuestMode();
        router.push("/login");
        router.refresh();
      }}
    >
      <LogOut className="size-4" />
      <span className="hidden sm:inline">Exit guest</span>
    </Button>
  );
}
