"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { updateProfile, type ActionResult } from "@/lib/profile/actions";
import { CURRENCIES } from "@/lib/format";
import type { UserProfile } from "@/lib/profile/queries";

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(updateProfile, undefined);

  // Refresh so the new name/currency propagate to the layout after a save.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const err = state?.fieldErrors ?? {};
  const saved = state?.ok === true;

  return (
    <form action={formAction} className="space-y-4">
      {profile.email && (
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={profile.email} disabled readOnly />
          <p className="text-xs text-muted-foreground">
            Your sign-in email can&apos;t be changed here.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="fullName">Display name</Label>
        <Input
          id="fullName"
          name="fullName"
          defaultValue={profile.isReal ? profile.name : ""}
          placeholder="e.g. Aamer Faiz"
          aria-invalid={!!err.fullName}
          required
        />
        {err.fullName && <p className="text-xs text-negative">{err.fullName}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="baseCurrency">Base currency</Label>
        <Select
          id="baseCurrency"
          name="baseCurrency"
          defaultValue={profile.baseCurrency}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.symbol} {c.code} — {c.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Used for display and as the default for new entries.
        </p>
      </div>

      {state?.error && !state.fieldErrors && (
        <p className="text-sm text-negative">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-positive">
            <Check className="size-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
