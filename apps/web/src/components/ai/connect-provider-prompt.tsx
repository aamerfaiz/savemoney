import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown on /ai when the user has no active provider key yet (BYOK gate). */
export function ConnectProviderPrompt() {
  return (
    <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand/15 text-brand">
        <Sparkles className="size-7" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">Connect an AI provider</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          AI Mode is bring-your-own-key: add a DeepSeek API key (OpenAI,
          Gemini and Claude are coming soon) and it powers everything here.
        </p>
      </div>
      <Link href="/settings#ai" className={cn(buttonVariants({}))}>
        Go to Settings &rarr; AI & Integrations
      </Link>
    </Card>
  );
}
