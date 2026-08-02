"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ActionResult } from "@/lib/investments/actions";
import {
  encryptedCreateInvestment,
  encryptedUpdateInvestment,
} from "@/lib/investments/client-actions";
import {
  INVESTMENT_TYPES,
  INVESTMENT_TYPE_LABEL,
  type InvestmentWithProjection,
} from "@/lib/investments/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function InvestmentForm({
  existing,
  onSuccess,
  dek,
}: {
  existing?: InvestmentWithProjection;
  onSuccess: () => void;
  dek: CryptoKey;
}) {
  const router = useRouter();
  const action = existing
    ? encryptedUpdateInvestment.bind(null, dek, existing.id)
    : encryptedCreateInvestment.bind(null, dek);
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(action, undefined);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onSuccess();
    }
  }, [state, onSuccess, router]);

  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Investment name</Label>
          <Input
            id="name"
            name="name"
            placeholder="e.g. Index Fund SIP"
            defaultValue={existing?.name ?? ""}
            aria-invalid={!!err.name}
            required
          />
          {err.name && <p className="text-xs text-negative">{err.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type">Type</Label>
          <Select
            id="type"
            name="type"
            defaultValue={existing?.type ?? "stocks"}
            className="w-36"
          >
            {INVESTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {INVESTMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="investedAmount"
          label="Amount invested"
          defaultValue={existing?.investedAmount}
          error={err.investedAmount}
          required
        />
        <Field
          id="currentValue"
          label="Current value"
          defaultValue={existing?.currentValue}
          error={err.currentValue}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="monthlyContribution"
          label="Monthly SIP (optional)"
          defaultValue={existing?.monthlyContribution ?? undefined}
          placeholder="0.00"
        />
        <Field
          id="expectedReturn"
          label="Expected return (%)"
          step="0.001"
          defaultValue={existing?.expectedReturn ?? 8}
          error={err.expectedReturn}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="startDate">Start date</Label>
        <Input
          id="startDate"
          name="startDate"
          type="date"
          defaultValue={existing?.startDate ?? todayISO()}
        />
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : existing ? "Save changes" : "Add investment"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  defaultValue,
  error,
  required,
  step = "0.01",
  placeholder = "0.00",
}: {
  id: string;
  label: string;
  defaultValue?: number;
  error?: string;
  required?: boolean;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        inputMode="decimal"
        step={step}
        min="0"
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        aria-invalid={!!error}
        required={required}
      />
      {error && <p className="text-xs text-negative">{error}</p>}
    </div>
  );
}
