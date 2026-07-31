"use client";

import { useActionState } from "react";
import { CircleAlert, Construction, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { askAssistant, type AskResult } from "@/lib/ai/actions";
import { AnswerMarkdown } from "@/components/ai/answer-markdown";

/** Phase 3.3 — ask-a-question shell. The rest of Phase 3.4 lands behind the
 * same "has an active key" gate as each feature ships. */
export function AiAssistantView() {
  const [state, formAction, pending] = useActionState<
    AskResult | undefined,
    FormData
  >(askAssistant, undefined);

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-brand" />
          Ask about your finances
        </div>

        <form action={formAction} className="space-y-3">
          <Textarea
            name="question"
            placeholder="e.g. Can I afford a $400/month car payment right now?"
            required
            disabled={pending}
          />
          <Button type="submit" disabled={pending}>
            <Send className="size-4" />
            {pending ? "Thinking…" : "Ask"}
          </Button>
        </form>

        {state?.error && (
          <p className="flex items-center gap-1.5 text-sm text-negative">
            <CircleAlert className="size-4 shrink-0" />
            {state.error}
          </p>
        )}
        {state?.ok && state.answer && (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <AnswerMarkdown text={state.answer} />
          </div>
        )}
      </Card>

      <Card className="flex flex-col items-center gap-3 border-dashed p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Construction className="size-6" />
        </span>
        <div className="space-y-1">
          <h2 className="font-medium">More AI features</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Monthly summaries, expense insights, receipt OCR, smarter CSV
            import and the what-if simulator roll in behind this same key
            next.
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          Phase 3.4
        </span>
      </Card>
    </div>
  );
}
