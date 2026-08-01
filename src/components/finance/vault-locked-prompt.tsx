"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 * Shared "you can't see this yet" gate for every encrypted-module page
 * (Phase 3.5.6) — replaces the old copy-pasted `if (!dek)` block. Fetches
 * `useVaultStatus()` to tell apart the two reasons a page has no DEK in
 * memory: no vault set up yet at all (setup prompt, deep-linking straight
 * to Settings → Vault & Encryption, with copy tailored for OAuth-only
 * accounts who have never typed a password into this app), vs. a vault
 * that exists but isn't unlocked in this session (unlock prompt — which
 * also checks this device's IndexedDB for a quick-unlock PIN wrap and, if
 * one exists, offers a PIN field right here instead of a trip to Settings).
 * Defaults to the "locked" copy while the status query is loading or if it
 * fails — the safer assumption, since it never tells an existing vault
 * owner their data is gone.
 */
export function VaultLockedPrompt({
  module,
  maxWidth = "max-w-3xl",
}: {
  module: string;
  maxWidth?: string;
}) {
  const status = useVaultStatus();
  const hasVault = status.data?.hasVault ?? true;
  const isOAuthOnly = status.data?.isOAuthOnly ?? false;

  if (!hasVault) {
    return (
      <div className={`mx-auto ${maxWidth}`}>
        <div className="space-y-2.5 rounded-md border border-border bg-muted/40 p-4 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-warning">
            <ShieldAlert className="size-4 shrink-0" />
            Set up your Vault Passphrase to see {module}
          </p>
          <p className="text-muted-foreground">
            {isOAuthOnly
              ? "You signed in with Google, so you've never set a password for this app — the Vault Passphrase is a separate secret you create now. It encrypts your financial data end-to-end: not even we can read it without it."
              : "This is separate from your login password. It encrypts your financial data end-to-end — not even we can read it without it."}
          </p>
          <Link
            href="/settings#vault"
            className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline"
          >
            <KeyRound className="size-4" />
            Set up your vault
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`mx-auto ${maxWidth} space-y-3`}>
      <p className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-4 text-sm text-warning">
        <ShieldAlert className="size-4 shrink-0" />
        <Link href="/settings#vault" className="hover:underline">
          Unlock your vault in Settings → Vault & Encryption
        </Link>
        &nbsp;to see {module}.
      </p>
      <QuickUnlockPin />
    </div>
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
    </div>
  );
}
