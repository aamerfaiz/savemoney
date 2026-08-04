"use client";

import { useState } from "react";
import { CircleAlert, Construction, Send, ShieldAlert, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AnswerMarkdown } from "@/components/ai/answer-markdown";
import { resolveActiveKey } from "@/lib/ai/client-key";
import { buildFinanceContext } from "@/lib/ai/context";
import { buildNetWorth } from "@/lib/networth/compute";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { useSideData } from "@/lib/finance/use-side-data";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@/lib/format";

/** Phase 3.3 — ask-a-question shell. Under Phase 3.5 the server can't
 * decrypt a stored key (or income/expenses) itself, so asking a question
 * now runs client-side: decrypt the saved key with the unlocked vault's
 * DEK, build the grounding context from already-decrypted finance data,
 * then forward both once, transiently, to /api/v1/ai/ask — see
 * docs/e2ee-path-b-plan.md "Resolved: the AI Assistant conflict". */
export function AiAssistantView({ currency }: { currency: CurrencyCode }) {
  const dek = useVaultStore((s) => s.dek);
  const finance = useFinanceData(currency);
  const side = useSideData(currency);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk() {
    if (!question.trim() || pending) return;
    if (!dek) {
      setError("Unlock your vault in Settings → Vault & Encryption first.");
      return;
    }

    setPending(true);
    setError(null);
    setAnswer(null);
    try {
      const key = await resolveActiveKey(dek);
      if ("error" in key) {
        setError(key.error);
        return;
      }

      // Grounding context is best-effort — if the finance data isn't ready
      // yet, ask ungrounded rather than blocking the question.
      let context: string | undefined;
      if (finance.data && side.data) {
        const netWorth = buildNetWorth({
          components: {
            investmentsValue: side.data.investmentsData.totalValue,
            goalsSaved: side.data.goalsData.totalSaved,
            loansRemaining: side.data.loansData.totalRemaining,
          },
          months: finance.data.analytics.months,
          snapshots: side.data.snapshots,
          currency,
        });
        context = buildFinanceContext({
          budgets: finance.data.budgets,
          goals: side.data.goalsData,
          loans: side.data.loansData,
          investments: side.data.investmentsData,
          analytics: finance.data.analytics,
          netWorth,
        });
      }

      const res = await fetch("/api/v1/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          apiKey: key.apiKey,
          provider: key.provider,
          model: key.model,
          context,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setAnswer(data.answer);
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-brand" />
          Ask about your finances
        </div>

        {!dek && (
          <p className="flex items-center gap-1.5 text-sm text-warning">
            <ShieldAlert className="size-4 shrink-0" />
            Unlock your vault in Settings → Vault & Encryption to ask a
            question.
          </p>
        )}

        <div className="space-y-3">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Can I afford a $400/month car payment right now?"
            required
            disabled={pending}
          />
          <Button type="button" onClick={handleAsk} disabled={pending || !question.trim()}>
            <Send className="size-4" />
            {pending ? "Thinking…" : "Ask"}
          </Button>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-negative">
            <CircleAlert className="size-4 shrink-0" />
            {error}
          </p>
        )}
        {answer && (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <AnswerMarkdown text={answer} />
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
