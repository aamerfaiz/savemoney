"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUserId } from "@/lib/vault/use-current-user-id";
import { clearPinWrap, getPinWrap, savePinWrap } from "@/lib/vault/local-store";
import { deriveKekFromSecret, PIN_KDF_PARAMS, randomBytes, toBase64, wrapDek } from "@/lib/vault/crypto";

const PIN_PATTERN = /^\d{4}$/;

/**
 * Opt-in "Quick unlock on this device" (Phase 3.5.6) — only rendered once
 * the vault is already unlocked via the full passphrase, since setting a
 * PIN just re-wraps the DEK already in memory under a PIN-derived key and
 * stashes that wrap in this device's own IndexedDB. See
 * src/lib/vault/local-store.ts and the plan doc's "Device-local
 * quick-unlock" decision — this never touches the server.
 */
export function QuickUnlockSettings({ dek }: { dek: CryptoKey }) {
  const userIdQuery = useCurrentUserId();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const userId = userIdQuery.data;
    if (!userId) return;
    let cancelled = false;
    getPinWrap(userId).then((record) => {
      if (!cancelled) setEnabled(Boolean(record));
    });
    return () => {
      cancelled = true;
    };
  }, [userIdQuery.data]);

  async function handleEnable() {
    const userId = userIdQuery.data;
    if (!userId) return;
    setError(null);
    if (!PIN_PATTERN.test(pin)) {
      setError("Use a 4-digit PIN.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match.");
      return;
    }
    setBusy(true);
    try {
      const salt = randomBytes(16);
      const kek = await deriveKekFromSecret(pin, salt, PIN_KDF_PARAMS);
      const wrap = await wrapDek(dek, kek);
      await savePinWrap(userId, wrap, toBase64(salt), PIN_KDF_PARAMS);
      setEnabled(true);
      setEditing(false);
      setPin("");
      setConfirmPin("");
    } catch {
      setError("Couldn't set up quick-unlock on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    const userId = userIdQuery.data;
    if (!userId) return;
    setBusy(true);
    try {
      await clearPinWrap(userId);
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) return null;

  if (enabled && !editing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
        <div className="flex items-center gap-2">
          <Fingerprint className="size-4 text-positive" />
          Quick unlock is on for this device
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={handleDisable} disabled={busy}>
          Turn off
        </Button>
      </div>
    );
  }

  if (!editing) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
        Set up quick unlock on this device
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Fingerprint className="size-4" />
        Quick unlock on this device
      </div>
      <p className="text-xs text-muted-foreground">
        A 4-digit PIN that unlocks the vault on just this device — it never
        replaces your passphrase and never leaves this device. A new device,
        or clearing this browser&apos;s storage, always falls back to your
        full passphrase or recovery code.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="quickUnlockPin">4-digit PIN</Label>
        <Input
          id="quickUnlockPin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoComplete="off"
          className="max-w-32"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="quickUnlockPinConfirm">Confirm PIN</Label>
        <Input
          id="quickUnlockPinConfirm"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          autoComplete="off"
          className="max-w-32"
        />
      </div>
      {error && <p className="text-sm text-negative">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" onClick={handleEnable} disabled={busy}>
          {busy ? "Saving…" : "Turn on quick unlock"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
