"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import {
  encryptedAddContribution,
  encryptedUpdateContribution,
} from "@/lib/collections/client-actions";
import type { CollectionAction } from "./collection-detail-view";
import type { CollectionContributionRow, CollectionContributor } from "@/lib/collections/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Logs a new contribution for a known contributor, or (with `existing`
 * passed) edits one in place — a mistyped amount no longer has to be
 * deleted and re-added. Owns its own mutation + optimistic dispatch, same
 * reasoning as ExpenseForm.
 */
export function ContributionForm({
  collectionId,
  contributor,
  existing,
  dek,
  dispatch,
  startTransition,
  onSuccess,
}: {
  collectionId: string;
  contributor: CollectionContributor;
  existing?: CollectionContributionRow;
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
    const contributedAt = String(fd.get("contributedAt") || todayISO());
    const method = String(fd.get("method") ?? "").trim() || null;

    startTransition(async () => {
      if (existing) {
        dispatch({
          type: "updateContribution",
          contributionId: existing.id,
          fields: { amount, contributedAt, method },
        });
        onSuccess();
        const result = await encryptedUpdateContribution(dek, collectionId, existing.id, {
          amount,
          contributedAt,
          method,
        });
        if (!result.ok) setError(result.error ?? "Couldn't save changes.");
      } else {
        dispatch({
          type: "addContribution",
          contribution: {
            id: `optimistic-${crypto.randomUUID()}`,
            contributorId: contributor.id,
            contributorName: contributor.displayName,
            amount,
            contributedAt,
            method,
            note: null,
          },
        });
        onSuccess();
        fd.set("contributorId", contributor.id);
        const result = await encryptedAddContribution(dek, collectionId, undefined, fd);
        if (!result.ok) setError(result.error ?? "Couldn't add contribution.");
      }
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
          <Input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            defaultValue={existing?.amount ?? ""}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="contributedAt">Date</Label>
          <Input
            id="contributedAt"
            name="contributedAt"
            type="date"
            defaultValue={existing?.contributedAt ?? todayISO()}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="method">Method (optional)</Label>
        <Input id="method" name="method" placeholder="e.g. cash, UPI" maxLength={40} defaultValue={existing?.method ?? ""} />
      </div>
      {error && <p className="text-xs text-negative">{error}</p>}
      <Button type="submit" size="sm" className="w-full" disabled={pending}>
        {pending ? "Saving…" : existing ? "Save changes" : `Add for ${contributor.displayName}`}
      </Button>
    </form>
  );
}
