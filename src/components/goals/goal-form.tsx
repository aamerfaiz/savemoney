"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createGoal, updateGoal, type ActionResult } from "@/lib/goals/actions";
import {
  GOAL_ICONS,
  GOAL_PRIORITIES,
  type GoalWithProgress,
} from "@/lib/goals/types";

export function GoalForm({
  existing,
  onSuccess,
}: {
  existing?: GoalWithProgress;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const action = existing ? updateGoal.bind(null, existing.id) : createGoal;
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
          <Label htmlFor="name">Goal name</Label>
          <Input
            id="name"
            name="name"
            placeholder="e.g. Emergency Fund"
            defaultValue={existing?.name ?? ""}
            aria-invalid={!!err.name}
            required
          />
          {err.name && <p className="text-xs text-negative">{err.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="icon">Icon</Label>
          <Select
            id="icon"
            name="icon"
            defaultValue={existing?.icon ?? "target"}
            className="w-28 capitalize"
          >
            {GOAL_ICONS.map((i) => (
              <option key={i} value={i} className="capitalize">
                {i.replace("-", " ")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="targetAmount">Target amount</Label>
          <Input
            id="targetAmount"
            name="targetAmount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            defaultValue={existing?.targetAmount ?? ""}
            aria-invalid={!!err.targetAmount}
            required
          />
          {err.targetAmount && (
            <p className="text-xs text-negative">{err.targetAmount}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currentAmount">Already saved</Label>
          <Input
            id="currentAmount"
            name="currentAmount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            defaultValue={existing?.currentAmount ?? 0}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="monthlyContribution">Monthly contribution</Label>
          <Input
            id="monthlyContribution"
            name="monthlyContribution"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="Optional"
            defaultValue={existing?.monthlyContribution ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <Select
            id="priority"
            name="priority"
            defaultValue={existing?.priority ?? "medium"}
          >
            {GOAL_PRIORITIES.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="deadline">Target date (optional)</Label>
        <Input
          id="deadline"
          name="deadline"
          type="date"
          defaultValue={existing?.deadline ?? ""}
        />
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : existing ? "Save changes" : "Create goal"}
      </Button>
    </form>
  );
}
