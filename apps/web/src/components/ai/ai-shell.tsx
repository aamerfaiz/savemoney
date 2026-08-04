"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { AiAssistantView } from "./ai-assistant-view";
import { SmartEntryView } from "./smart-entry-view";
import type { SmartEntryReference } from "./smart-entry-types";
import type { CurrencyCode } from "@savemoney/finance-engine/format";

type Mode = "ask" | "manage";

const MODE_LABEL: Record<Mode, string> = { ask: "Ask", manage: "Manage" };

export function AiShell({
  reference,
  currency,
}: {
  reference: SmartEntryReference;
  currency: CurrencyCode;
}) {
  const [mode, setMode] = useState<Mode>("ask");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
        {(["ask", "manage"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-[7px] py-2 text-sm font-medium transition-colors",
              mode === m ? "bg-brand/20 text-brand" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {mode === "ask" ? (
        <AiAssistantView currency={currency} />
      ) : (
        <SmartEntryView reference={reference} />
      )}
    </div>
  );
}
