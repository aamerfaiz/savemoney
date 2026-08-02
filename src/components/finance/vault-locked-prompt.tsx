"use client";

import { useEffect, useState } from "react";

import { KeyRound, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { VaultUnlockFlow } from "@/components/vault/vault-unlock-flow";
import { useVaultStatus } from "@/lib/vault/use-vault-status";
import { useCurrentUserId } from "@/lib/vault/use-current-user-id";
import { useVaultStore } from "@/lib/vault/store";
import { PIN_MAX_ATTEMPTS } from "@/lib/vault/constants";
import {
  clearPinWrap,
  getPinWrap,
  recordFailedPinAttempt,
  resetPinAttempts,
  type PinWrapRecord,
} from "@/lib/vault/local-store";
import { deriveKekFromSecret, fromBase64, unwrapDek } from "@/lib/vault/crypto";

/**
 * Shared "you can't see this yet" gate for every encrypted-module page —
 * replaces the old copy-pasted `if (!dek)` block. Rather than pointing
 * the user to Settings (the original 3.5.6 version), this renders the
 * actual setup/unlock/recover flow inline as an overlay
 * (`VaultUnlockFlow`, shared with the Settings page itself), so nobody
 * has to leave the page they were trying to use just to type a
 * passphrase. Fetches `useVaultStatus()` to tell apart "no vault yet"
 * (setup form, copy tailored for OAuth-only accounts) from "locked this
 * session" (unlock form, plus this device's quick-unlock PIN if one's
 * set up — see `QuickUnlockPin` below). Defaults to the "locked" copy
 * while the status query is loading or if it fails — the safer
 * assumption, since it never tells an existing vault owner their data is
 * gone.
 *
 * The overlay opens automatically but is genuinely closable (real X /
 * backdrop / Escape, not a no-op) — it used to trap the user with no way
 * out, which also blocked reaching the nav to log out. Closing it leaves
 * a page-level trigger button behind so they can reopen it whenever
 * they're ready, instead of the old "go to Settings" link.
 *
 * Deliberately waits for `useVaultStatus()` to actually resolve before
 * rendering `VaultUnlockFlow` at all, rather than passing it a guessed
 * `hasVault` while loading. `VaultUnlockFlow` only reads its `hasVault`
 * prop once, to seed its internal mode at mount (same as the Settings
 * page, where the prop is already correct from a server-rendered value
 * by the time anything mounts) — feeding it a since-corrected guess here
 * would leave a brand-new user stuck on the "enter your passphrase"
 * screen forever, since nothing re-derives that state after mount.
 */
export function VaultLockedPrompt({ module }: { module: string }) {
  const status = useVaultStatus();
  const [open, setOpen] = useState(true);

  if (status.isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="h-24 animate-pulse rounded-md border border-border bg-muted/40" />
      </div>
    );
  }

  const hasVault = status.data?.hasVault ?? true;
  const isOAuthOnly = status.data?.isOAuthOnly ?? false;

  return (
    <>
      <div className="mx-auto max-w-3xl">
        <div className="space-y-2.5 rounded-md border border-border bg-muted/40 p-4 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-warning">
            <ShieldAlert className="size-4 shrink-0" />
            {hasVault
              ? `Unlock your vault to see ${module}.`
              : `Set up encryption to see ${module}.`}
          </p>
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            <KeyRound className="size-4" />
            {hasVault ? "Unlock vault" : "Set Encryption"}
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={hasVault ? "Unlock your vault" : "Set up your vault"}
        description={
          hasVault
            ? `Unlock your vault to see ${module}.`
            : `Set up your Vault Passphrase to see ${module}.`
        }
      >
        <div className="space-y-4">
          {hasVault && <QuickUnlockPin />}
          <VaultUnlockFlow hasVault={hasVault} isOAuthOnly={isOAuthOnly} />
        </div>
      </Dialog>
    </>
  );
}

/** Offers PIN quick-unlock right here, inline, if this device has one set
 * up for the signed-in account — checked against local IndexedDB only, see
 * src/lib/vault/local-store.ts. Renders nothing if no PIN wrap exists on
 * this device (the common case: a new device, or quick-unlock never
 * enabled), so it's a silent no-op everywhere except a device the user
 * opted in on. */
function QuickUnlockPin() {
  const userIdQuery = useCurrentUserId();
  const unlock = useVaultStore((s) => s.unlock);
  const [record, setRecord] = useState<PinWrapRecord | null | undefined>(undefined);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const userId = userIdQuery.data;
    if (!userId) return;
    let cancelled = false;
    getPinWrap(userId).then((r) => {
      if (!cancelled) setRecord(r);
    });
    return () => {
      cancelled = true;
    };
  }, [userIdQuery.data]);

  if (!record) return null;

  async function handleSubmit() {
    const userId = userIdQuery.data;
    if (!userId || !record) return;
    setError(null);
    setBusy(true);
    try {
      const kek = await deriveKekFromSecret(pin, fromBase64(record.salt), record.kdfParams);
      const dek = await unwrapDek(record.wrap, kek);
      await resetPinAttempts(userId);
      unlock(dek);
    } catch {
      const attempts = await recordFailedPinAttempt(userId);
      if (attempts >= PIN_MAX_ATTEMPTS) {
        await clearPinWrap(userId);
        setRecord(null);
        setError(
          "Too many wrong attempts — quick-unlock has been turned off on this device. Use your passphrase or recovery code instead.",
        );
      } else {
        setError(`Wrong PIN. ${PIN_MAX_ATTEMPTS - attempts} attempt(s) left before quick-unlock resets on this device.`);
      }
    } finally {
      setBusy(false);
      setPin("");
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-4 text-sm">
      <p className="font-medium">Quick unlock on this device</p>
      <div className="flex gap-2">
        <Input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pin && handleSubmit()}
          autoComplete="off"
          className="max-w-32"
          placeholder="PIN"
        />
        <Button type="button" onClick={handleSubmit} disabled={busy || !pin}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
      </div>
      {error && <p className="text-xs text-negative">{error}</p>}
      <p className="text-xs text-muted-foreground">or use your full passphrase below</p>
    </div>
  );
}
