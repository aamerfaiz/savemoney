"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createLoan, updateLoan, type ActionResult } from "@/lib/loans/actions";
import { LOAN_TYPES, type LoanWithProjection } from "@/lib/loans/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function LoanForm({
  existing,
  onSuccess,
}: {
  existing?: LoanWithProjection;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const action = existing ? updateLoan.bind(null, existing.id) : createLoan;
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
          <Label htmlFor="name">Loan name</Label>
          <Input
            id="name"
            name="name"
            placeholder="e.g. Home Loan"
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
            defaultValue={existing?.type ?? "personal"}
            className="w-32 capitalize"
          >
            {LOAN_TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t.replace("_", " ")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="principal"
          label="Original principal"
          defaultValue={existing?.principal}
          error={err.principal}
          required
        />
        <Field
          id="remainingAmount"
          label="Remaining balance"
          defaultValue={existing?.remainingAmount}
          error={err.remainingAmount}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="interestRate"
          label="Interest rate (%)"
          step="0.001"
          defaultValue={existing?.interestRate}
          error={err.interestRate}
          required
        />
        <Field
          id="emi"
          label="Monthly EMI"
          defaultValue={existing?.emi}
          error={err.emi}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="extraEmi"
          label="Extra EMI (optional)"
          defaultValue={existing?.extraEmi ?? undefined}
          placeholder="0.00"
        />
        <div className="space-y-1.5">
          <Label htmlFor="startDate">Start date</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={existing?.startDate ?? todayISO()}
          />
        </div>
      </div>

      <input
        type="hidden"
        name="remainingMonths"
        value={existing?.remainingMonths ?? ""}
      />

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : existing ? "Save changes" : "Add loan"}
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
