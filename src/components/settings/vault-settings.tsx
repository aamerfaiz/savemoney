"use client";

import { useState } from "react";
import { LockOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deriveKekFromSecret,
  PASSPHRASE_KDF_PARAMS,
  randomBytes,
  toBase64,
  wrapDek,
} from "@/lib/vault/crypto";
import { rotateVaultSecret } from "@/lib/vault/actions";
import { useVaultStore } from "@/lib/vault/store";
import { VaultUnlockFlow } from "@/components/vault/vault-unlock-flow";
import { QuickUnlockSettings } from "./quick-unlock-settings";
import { RotateVaultSettings } from "./rotate-vault-settings";

/**
 * Settings → Vault & Encryption card. Setup/locked/recover all delegate
 * to the shared `VaultUnlockFlow` (same component `VaultLockedPrompt`
 * uses on every other page as an overlay) — this file only owns what's
 * specific to an *already-unlocked* vault: change passphrase,
 * quick-unlock, rotation, and the lock button.
 */
export function VaultSettings({
  hasVault,
  isOAuthOnly = false,
}: {
  hasVault: boolean;
  isOAuthOnly?: boolean;
}) {
  const dek = useVaultStore((s) => s.dek);
  const lock = useVaultStore((s) => s.lock);
  const unlock = useVaultStore((s) => s.unlock);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRotate, setShowRotate] = useState(false);
  const [newPassphrase, setNewPassphrase] = useState("");
  const [deviceStateKey, setDeviceStateKey] = useState(0);

  async function handleRotatePassphrase() {
    if (!dek) return;
    setError(null);
    if (newPassphrase.length < 10) {
      setError("Use at least 10 characters for your new passphrase.");
      return;
    }
    setBusy(true);
    try {
      const salt = randomBytes(16);
      const kek = await deriveKekFromSecret(newPassphrase, salt, PASSPHRASE_KDF_PARAMS);
      const wrap = await wrapDek(dek, kek);
      const result = await rotateVaultSecret({
        path: "password",
        wrap,
        salt: toBase64(salt),
        kdfParams: PASSPHRASE_KDF_PARAMS,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't rotate the passphrase.");
        return;
      }
      setNewPassphrase("");
      setShowRotate(false);
    } catch {
      setError("Something went wrong rotating the passphrase.");
    } finally {
      setBusy(false);
    }
  }

  if (!dek) {
    return <VaultUnlockFlow hasVault={hasVault} isOAuthOnly={isOAuthOnly} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-positive">
          <LockOpen className="size-4" />
          Vault unlocked on this device
        </div>
        <Button type="button" variant="outline" size="sm" onClick={lock}>
          Lock now
        </Button>
      </div>

      {!showRotate ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowRotate(true)}>
          Change passphrase
        </Button>
      ) : (
        <div className="space-y-3 rounded-md border border-border p-3">
          <Label htmlFor="newPassphrase">New passphrase</Label>
          <Input
            id="newPassphrase"
            type="password"
            value={newPassphrase}
            onChange={(e) => setNewPassphrase(e.target.value)}
            autoComplete="off"
          />
          <div className="flex gap-2">
            <Button type="button" onClick={handleRotatePassphrase} disabled={busy}>
              {busy ? "Saving…" : "Save new passphrase"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowRotate(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This re-wraps your vault key under the new passphrase — none of
            your encrypted data is touched or re-uploaded.
          </p>
        </div>
      )}

      <QuickUnlockSettings key={deviceStateKey} dek={dek} />

      <RotateVaultSettings
        dek={dek}
        onRotated={(newDek) => {
          unlock(newDek);
          setDeviceStateKey((k) => k + 1);
        }}
      />

      {error && <p className="text-sm text-negative">{error}</p>}
    </div>
  );
}
