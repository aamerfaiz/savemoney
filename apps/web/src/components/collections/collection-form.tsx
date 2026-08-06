"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import type { ActionResult } from "@/lib/collections/actions";
import { encryptedCreateCollection, encryptedUpdateCollection } from "@/lib/collections/client-actions";
import {
  COLLECTION_ICONS,
  COLLECTION_STATUSES,
  type CollectionWithProgress,
} from "@/lib/collections/types";

export function CollectionForm({
  existing,
  onSuccess,
  dek,
}: {
  existing?: CollectionWithProgress;
  onSuccess: () => void;
  dek: CryptoKey;
}) {
  const router = useRouter();
  const invalidateFinanceData = useInvalidateFinanceData();
  const action = existing
    ? encryptedUpdateCollection.bind(null, dek, existing.id)
    : encryptedCreateCollection.bind(null, dek);
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(action, undefined);

  useEffect(() => {
    if (state?.ok) {
      invalidateFinanceData();
      router.refresh();
      onSuccess();
    }
  }, [state, onSuccess, router, invalidateFinanceData]);

  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="title">Collection name</Label>
          <Input
            id="title"
            name="title"
            placeholder="e.g. Priya's farewell gift"
            defaultValue={existing?.title ?? ""}
            aria-invalid={!!err.title}
            required
          />
          {err.title && <p className="text-xs text-negative">{err.title}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="icon">Icon</Label>
          <Select
            id="icon"
            name="icon"
            defaultValue={existing?.icon ?? "gift"}
            className="w-28 capitalize"
          >
            {COLLECTION_ICONS.map((i) => (
              <option key={i} value={i} className="capitalize">
                {i.replace("-", " ")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="purpose">What's it for? (optional)</Label>
        <Input
          id="purpose"
          name="purpose"
          placeholder="e.g. Team is chipping in for a going-away gift"
          defaultValue={existing?.purpose ?? ""}
          maxLength={200}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="targetAmount">Target amount (optional)</Label>
          <Input
            id="targetAmount"
            name="targetAmount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="No fixed target"
            defaultValue={existing?.targetAmount ?? ""}
            aria-invalid={!!err.targetAmount}
          />
          {err.targetAmount && (
            <p className="text-xs text-negative">{err.targetAmount}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eventDate">Event date (optional)</Label>
          <Input
            id="eventDate"
            name="eventDate"
            type="date"
            defaultValue={existing?.eventDate ?? ""}
          />
        </div>
      </div>

      {existing && (
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={existing.status}>
            {COLLECTION_STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </Select>
        </div>
      )}
      {!existing && <input type="hidden" name="status" value="open" />}

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : existing ? "Save changes" : "Create collection"}
      </Button>
    </form>
  );
}
