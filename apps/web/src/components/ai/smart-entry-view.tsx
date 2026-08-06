"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, ShieldAlert, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DraftCard } from "./draft-card";
import type { DraftItemState, SmartEntryReference } from "./smart-entry-types";
import { resolveActiveKey } from "@/lib/ai/client-key";
import { commitClientCapability, type ClientCommitResult } from "@/lib/ai/capabilities/client-commit";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { useSideData } from "@/lib/finance/use-side-data";
import { useCollectionsData } from "@/lib/collections/use-collections-data";
import { useVaultStore } from "@/lib/vault/store";
import type { CurrencyCode } from "@savemoney/finance-engine/format";

type Phase = "idle" | "loading" | "results" | "empty" | "error";

export function SmartEntryView({
  reference,
  currency,
}: {
  reference: SmartEntryReference;
  currency: CurrencyCode;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const dek = useVaultStore((s) => s.dek);
  // Feeds investment.contribution/loan.payment/goal.contribution's need for
  // the target's *current* decrypted amounts (see client-commit.ts) — the
  // same query the Investments/Loans/Goals pages already run, so it's
  // typically warm from TanStack Query's cache rather than a fresh fetch.
  const sideData = useSideData(currency);
  // Feeds collection.contribution/collection.edit/collection.payout's need
  // for the target collection's *current* decrypted state — its own query
  // key (not bundled into useSideData, see use-collections-data.ts), so
  // this is typically a fresh fetch the first time Smart Entry needs it
  // rather than piggybacking on the Collections page being open too.
  const collectionsData = useCollectionsData(currency);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftItemState[]>([]);

  const okDrafts = drafts.filter((d) => d.ok);
  const selectedCount = okDrafts.filter((d) => d.selected).length;
  const allSelected = okDrafts.length > 0 && selectedCount === okDrafts.length;
  const anyCommitting = drafts.some((d) => d.committing);

  async function runExtract() {
    if (!prompt.trim() || phase === "loading") return;
    if (!dek) {
      setError("Unlock your vault in Settings → Vault & Encryption first.");
      setPhase("error");
      return;
    }
    setPhase("loading");
    setError(null);
    setDrafts([]);
    try {
      const key = await resolveActiveKey(dek);
      if ("error" in key) {
        setError(key.error);
        setPhase("error");
        return;
      }

      const res = await fetch("/api/v1/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          apiKey: key.apiKey,
          provider: key.provider,
          model: key.model,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        setPhase("error");
        return;
      }
      const items: DraftItemState[] = (data.drafts ?? []).map(
        (d: Omit<DraftItemState, "selected" | "committing">) => ({
          ...d,
          fields: d.fields ?? {},
          warnings: d.warnings ?? [],
          // Destructive drafts (delete) are opt-in, never opt-out — a batch
          // "confirm all" should never silently sweep up a delete.
          selected: d.ok && !d.destructive,
          committing: false,
          requiresClientEncryption: d.requiresClientEncryption ?? false,
        }),
      );
      setDrafts(items);
      setPhase(items.length ? "results" : "empty");
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setPhase("error");
    }
  }

  function toggleSelect(id: string) {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d)));
  }

  function toggleSelectAll() {
    setDrafts((ds) => ds.map((d) => (d.ok ? { ...d, selected: !allSelected } : d)));
  }

  function updateField(id: string, key: string, value: string) {
    setDrafts((ds) =>
      ds.map((d) => (d.id === id ? { ...d, fields: { ...d.fields, [key]: value } } : d)),
    );
  }

  function updateTarget(id: string, targetId: string, targetLabel: string | undefined) {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, targetId, targetLabel } : d)));
  }

  function discard(id: string) {
    setDrafts((ds) => ds.filter((d) => d.id !== id));
  }

  /**
   * Splits by `requiresClientEncryption`: create/log-against drafts commit
   * right here in the browser (via `commitClientCapability`, which encrypts
   * with the unlocked vault DEK before calling the real Server Action —
   * see client-commit.ts), while plain deletes still go through
   * `POST /api/v1/ai/commit` exactly as before. Results are matched back by
   * draft id (a `Map`, not array position) since the two paths resolve
   * independently and out of order relative to each other.
   */
  async function commitItems(targets: DraftItemState[]) {
    setDrafts((ds) =>
      ds.map((d) => (targets.some((t) => t.id === d.id) ? { ...d, committing: true, commitError: undefined } : d)),
    );

    const resultsById = new Map<string, { ok: boolean; error?: string }>();
    const clientTargets = targets.filter((t) => t.requiresClientEncryption);
    const serverTargets = targets.filter((t) => !t.requiresClientEncryption);

    if (clientTargets.length > 0) {
      if (!dek) {
        for (const t of clientTargets) {
          resultsById.set(t.id, { ok: false, error: "Unlock your vault in Settings → Vault & Encryption first." });
        }
      } else {
        const ctx = {
          dek,
          investments: sideData.data?.investmentsData.investments ?? [],
          loans: sideData.data?.loansData.loans ?? [],
          goals: sideData.data?.goalsData.goals ?? [],
          collections: collectionsData.data?.collectionsData.collections ?? [],
        };
        await Promise.all(
          clientTargets.map(async (t) => {
            let result: ClientCommitResult;
            try {
              result = await commitClientCapability(t.capability, t.fields, t.targetId, ctx);
            } catch {
              result = { ok: false, error: "Couldn't apply this — try again." };
            }
            resultsById.set(t.id, result);
          }),
        );
      }
    }

    if (serverTargets.length > 0) {
      let data: { ok: boolean; results?: { ok: boolean; error?: string }[]; error?: string };
      try {
        const res = await fetch("/api/v1/ai/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: serverTargets.map((t) => ({ capability: t.capability, fields: t.fields, targetId: t.targetId })),
          }),
        });
        data = await res.json();
        if (!res.ok) data.ok = false;
      } catch {
        data = { ok: false, error: "Couldn't reach the server — check your connection and try again." };
      }

      if (!data.ok || !data.results) {
        const msg = data.error ?? "Couldn't apply these — try again.";
        for (const t of serverTargets) resultsById.set(t.id, { ok: false, error: msg });
      } else {
        serverTargets.forEach((t, i) => {
          resultsById.set(t.id, data.results![i] ?? { ok: false, error: "Couldn't apply this." });
        });
      }
    }

    setDrafts((ds) => {
      const next: DraftItemState[] = [];
      for (const d of ds) {
        if (!targets.some((t) => t.id === d.id)) {
          next.push(d);
          continue;
        }
        const r = resultsById.get(d.id);
        if (r?.ok) continue; // committed — drop it from the list
        next.push({ ...d, committing: false, commitError: r?.error ?? "Couldn't apply this." });
      }
      return next;
    });
    invalidateFinanceData();
    router.refresh();
  }

  const primaryLabel =
    selectedCount === 0
      ? "Select at least one"
      : allSelected
        ? `Confirm all (${selectedCount})`
        : `Confirm selected (${selectedCount})`;

  return (
    <div className="space-y-5 pb-20">
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-brand" />
          Add or delete from a prompt
        </div>
        <p className="text-xs text-muted-foreground">
          Describe what happened — a transaction, an investment, a loan payment, a goal contribution, or something to
          remove — you&apos;ll review and confirm before anything is applied.
        </p>
        {!dek && (
          <p className="flex items-center gap-1.5 text-sm text-warning">
            <ShieldAlert className="size-4 shrink-0" />
            Unlock your vault in Settings → Vault & Encryption to use Smart
            Entry.
          </p>
        )}
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Spent 45 on groceries yesterday, and change my Nifty50 SIP to 250"
          disabled={phase === "loading"}
        />
        <Button onClick={runExtract} disabled={phase === "loading" || !prompt.trim()}>
          {phase === "loading" ? "Reading…" : "Extract"}
        </Button>
      </Card>

      {phase === "loading" && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-negative">
          <CircleAlert className="size-4 shrink-0" />
          {error}
        </p>
      )}

      {phase === "empty" && (
        <p className="text-sm text-muted-foreground">
          Didn&apos;t find anything to record, change, or remove in that — try being more specific about amounts,
          dates, or names.
        </p>
      )}

      {drafts.length > 0 && (
        <>
          {okDrafts.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="size-4 accent-[var(--color-brand)]"
              />
              Select all · {selectedCount} of {okDrafts.length} selected
            </label>
          )}

          <div className="space-y-3">
            {drafts.map((d) => (
              <DraftCard
                key={d.id}
                draft={d}
                reference={reference}
                onToggleSelect={toggleSelect}
                onFieldChange={updateField}
                onTargetChange={updateTarget}
                onDiscard={discard}
                onCommitOne={(id) => {
                  const target = drafts.find((x) => x.id === id);
                  if (target) commitItems([target]);
                }}
              />
            ))}
          </div>

          {okDrafts.length > 0 && (
            <div
              className="fixed inset-x-0 bottom-16 z-40 border-t border-border bg-background/85 px-4 py-3 backdrop-blur-lg lg:sticky lg:inset-x-auto lg:bottom-4 lg:mt-2 lg:rounded-lg lg:border lg:px-4"
            >
              <div className="mx-auto max-w-2xl">
                <Button
                  className="w-full"
                  disabled={selectedCount === 0 || anyCommitting}
                  onClick={() => commitItems(okDrafts.filter((d) => d.selected))}
                >
                  {anyCommitting ? "Confirming…" : primaryLabel}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
