"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import { encryptedAddContribution } from "@/lib/collections/client-actions";
import type { CollectionAction } from "./collection-detail-view";
import type { CollectionParticipant } from "@/lib/collections/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Inline "log a contribution" mini-form scoped to one already-known
 * participant — the roster picker step happened before this ever renders
 * (see ParticipantsPanel), so this only asks for amount/date/method. Owns
 * its own mutation + optimistic dispatch, same reasoning as ExpenseForm. */
export function ContributionForm({
  collectionId,
  participant,
  dek,
  dispatch,
  startTransition,
  onSuccess,
}: {
  collectionId: string;
  participant: CollectionParticipant;
  dek: CryptoKey;
  dispatch: (action: CollectionAction) => void;
  startTransition: (callback: () => void | Promise<void>) => void;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const amount = Number(fd.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    setPending(true);
    fd.set("participantId", participant.id);
    const contributedAt = String(fd.get("contributedAt") || todayISO());
    const method = String(fd.get("method") ?? "").trim() || null;

    startTransition(async () => {
      dispatch({
        type: "addContribution",
        contribution: {
          id: `optimistic-${crypto.randomUUID()}`,
          participantId: participant.id,
          contributorName: participant.displayName,
          amount,
          contributedAt,
          method,
          note: null,
          isLegacy: false,
        },
      });
      onSuccess();

      const result = await encryptedAddContribution(dek, collectionId, undefined, fd);
      if (!result.ok) setError(result.error ?? "Couldn't add contribution.");
      invalidateFinanceData();
      router.refresh();
      setPending(false);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 rounded-md border border-border p-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <Label htmlFor="amount">Amount</Label>
          <Input id="amount" name="amount" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" required autoFocus />
        </div>
        <div className="space-y-1">
          <Label htmlFor="contributedAt">Date</Label>
          <Input id="contributedAt" name="contributedAt" type="date" defaultValue={todayISO()} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="method">Method (optional)</Label>
        <Input id="method" name="method" placeholder="e.g. cash, UPI" maxLength={40} />
      </div>
      {error && <p className="text-xs text-negative">{error}</p>}
      <Button type="submit" size="sm" className="w-full" disabled={pending}>
        {pending ? "Adding…" : `Add for ${participant.displayName}`}
      </Button>
    </form>
  );
}
