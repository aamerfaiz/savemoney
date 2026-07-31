"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { AiAssistantView } from "./ai-assistant-view";
import { SmartEntryView } from "./smart-entry-view";
import type { SmartEntryReference } from "./smart-entry-types";

type Mode = "ask" | "add";

export function AiShell({ reference }: { reference: SmartEntryReference }) {
  const [mode, setMode] = useState<Mode>("ask");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
        {(["ask", "add"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-[7px] py-2 text-sm font-medium capitalize transition-colors",
              mode === m ? "bg-brand/20 text-brand" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === "ask" ? <AiAssistantView /> : <SmartEntryView reference={reference} />}
    </div>
  );
}
