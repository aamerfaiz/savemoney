"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PiggyBank, Plane } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useInvalidateFinanceData } from "@/lib/finance/use-invalidate-finance-data";
import type { ActionResult } from "@/lib/collections/actions";
import { encryptedCreateCollection, encryptedUpdateCollection } from "@/lib/collections/client-actions";
import {
  COLLECTION_ICONS,
  COLLECTION_STATUSES,
  type CollectionType,
  type CollectionWithProgress,
} from "@/lib/collections/types";

const TYPE_OPTIONS: {
  value: CollectionType;
  label: string;
  description: string;
  icon: typeof PiggyBank;
}[] = [
  {
    value: "pool",
    label: "Pool",
    description: "Everyone chips into a shared pot, you track what's spent from it.",
    icon: PiggyBank,
  },
  {
    value: "trip",
    label: "Trip",
    description: "No pot — track who paid for what and who owes whom, Splitwise-style.",
    icon: Plane,
  },
];

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
  const [type, setType] = useState<CollectionType>(existing?.type ?? "pool");

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
      {existing ? (
        <input type="hidden" name="type" value={existing.type} />
      ) : (
        <div className="space-y-1.5">
          <Label>Type</Label>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                    selected ? "border-brand bg-brand/10" : "border-border hover:bg-muted",
                  )}
                >
                  <Icon className={cn("size-4", selected ? "text-brand" : "text-muted-foreground")} />
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                </button>
              );
            })}
          </div>
          <input type="hidden" name="type" value={type} />
        </div>
      )}
      {existing && (
        <Badge variant="default" className="gap-1">
          {(() => {
            const Icon = TYPE_OPTIONS.find((o) => o.value === existing.type)?.icon ?? PiggyBank;
            return <Icon className="size-3" />;
          })()}
          {TYPE_OPTIONS.find((o) => o.value === existing.type)?.label ?? "Pool"} collection
        </Badge>
      )}

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
        <Label htmlFor="purpose">What&apos;s it for? (optional)</Label>
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
