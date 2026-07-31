"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Lock, LockOpen, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import {
  deriveKekFromHighEntropySecret,
  deriveKekFromSecret,
  fromBase64,
  generateDek,
  generateRecoveryCode,
  PASSPHRASE_KDF_PARAMS,
  randomBytes,
  toBase64,
  unwrapDek,
  wrapDek,
  type Argon2Params,
} from "@/lib/vault/crypto";
import { getVaultBlob, setupVault, rotateVaultSecret } from "@/lib/vault/actions";
import { useVaultStore } from "@/lib/vault/store";

type Mode = "loading" | "setup" | "showRecovery" | "locked" | "unlocked";

export function VaultSettings({ hasVault: initialHasVault }: { hasVault: boolean }) {
  const router = useRouter();
  const dek = useVaultStore((s) => s.dek);
  const unlock = useVaultStore((s) => s.unlock);
  const lock = useVaultStore((s) => s.lock);

  const [mode, setMode] = useState<Mode>(dek ? "unlocked" : initialHasVault ? "locked" : "setup");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryDisplay, setRecoveryDisplay] = useState<string | null>(null);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [showRotate, setShowRotate] = useState(false);
  const [newPassphrase, setNewPassphrase] = useState("");

  // Held only across the setup flow (between generating the keys and the
  // user confirming they saved the recovery code) — never persisted.
  const [pendingSetup, setPendingSetup] = useState<{
    dek: CryptoKey;
    passwordWrap: { ciphertext: string; iv: string };
    passwordSalt: Uint8Array<ArrayBuffer>;
    recoveryWrap: { ciphertext: string; iv: string };
    recoverySalt: Uint8Array<ArrayBuffer>;
  } | null>(null);

  async function handleBeginSetup() {
    setError(null);
    if (passphrase.length < 10) {
      setError("Use at least 10 characters for your vault passphrase.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("Passphrases don't match.");
      return;
    }
    setBusy(true);
    try {
      const newDek = await generateDek();

      const passwordSalt = randomBytes(16);
      const passwordKek = await deriveKekFromSecret(
        passphrase,
        passwordSalt,
        PASSPHRASE_KDF_PARAMS,
      );
      const passwordWrap = await wrapDek(newDek, passwordKek);

      const recovery = generateRecoveryCode();
      const recoverySalt = randomBytes(16);
      const recoveryKek = await deriveKekFromHighEntropySecret(
        recovery.bytes,
        recoverySalt,
        "vault-recovery-kek",
      );
      const recoveryWrap = await wrapDek(newDek, recoveryKek);

      setPendingSetup({ dek: newDek, passwordWrap, passwordSalt, recoveryWrap, recoverySalt });
      setRecoveryDisplay(recovery.display);
      setMode("showRecovery");
    } catch {
      setError("Couldn't set up the vault in this browser. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmSetup() {
    if (!pendingSetup || !recoveryConfirmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setupVault({
        passwordWrap: pendingSetup.passwordWrap,
        passwordSalt: toBase64(pendingSetup.passwordSalt),
        passwordKdfParams: PASSPHRASE_KDF_PARAMS,
        recoveryWrap: pendingSetup.recoveryWrap,
        recoverySalt: toBase64(pendingSetup.recoverySalt),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the vault.");
        setBusy(false);
        return;
      }
      unlock(pendingSetup.dek);
      setPendingSetup(null);
      setRecoveryDisplay(null);
      setPassphrase("");
      setConfirmPassphrase("");
      setMode("unlocked");
      router.refresh();
    } catch {
      setError("Something went wrong saving the vault.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setError(null);
    setBusy(true);
    try {
      const blob = await getVaultBlob();
      if ("error" in blob) {
        setError(blob.error ?? "Something went wrong.");
        return;
      }
      if (!blob.hasVault) {
        setMode("setup");
        return;
      }
      const kek = await deriveKekFromSecret(
        passphrase,
        fromBase64(blob.passwordSalt),
        blob.passwordKdfParams as Argon2Params,
      );
      const unwrapped = await unwrapDek(blob.passwordWrap, kek);
      unlock(unwrapped);
      setPassphrase("");
      setMode("unlocked");
      router.refresh();
    } catch {
      setError("Incorrect passphrase.");
    } finally {
      setBusy(false);
    }
  }

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

  function handleLock() {
    lock();
    setMode("locked");
  }

  if (mode === "unlocked" && dek) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium text-positive">
            <LockOpen className="size-4" />
            Vault unlocked on this device
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleLock}>
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

        {error && <p className="text-sm text-negative">{error}</p>}
      </div>
    );
  }

  if (mode === "locked") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Lock className="size-4" />
          Your vault is locked
        </div>
        <Label htmlFor="unlockPassphrase">Vault passphrase</Label>
        <Input
          id="unlockPassphrase"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoComplete="off"
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
        />
        {error && <p className="text-sm text-negative">{error}</p>}
        <Button type="button" onClick={handleUnlock} disabled={busy || !passphrase}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Lost your passphrase? Recovery-code unlock is coming in the next
          increment (3.5.6) — for now, this is the only unlock path.
        </p>
      </div>
    );
  }

  // mode === "setup" | "showRecovery"
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brand" />
        <p>
          Set up your vault to encrypt your financial data end-to-end — not
          even we can read it. This passphrase is separate from your login
          password and is never sent anywhere.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="setupPassphrase">Vault passphrase</Label>
        <Input
          id="setupPassphrase"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassphrase">Confirm passphrase</Label>
        <Input
          id="confirmPassphrase"
          type="password"
          value={confirmPassphrase}
          onChange={(e) => setConfirmPassphrase(e.target.value)}
          autoComplete="off"
        />
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      <Button type="button" onClick={handleBeginSetup} disabled={busy}>
        {busy ? "Setting up…" : "Set up vault"}
      </Button>

      <Dialog
        open={mode === "showRecovery"}
        onClose={() => {}}
        title="Save your recovery code"
        description="This is the only way back into your vault if you forget your passphrase. It's shown once — write it down now."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-4 font-mono text-sm tracking-wide">
            <KeyRound className="size-4 shrink-0 text-brand" />
            <span className="break-all">{recoveryDisplay}</span>
          </div>
          <p className="text-xs text-negative">
            If you lose both your passphrase and this code, your data is
            permanently unreadable — there is no support-ticket recovery,
            because there&apos;s nothing server-side that could decrypt it.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={recoveryConfirmed}
              onChange={(e) => setRecoveryConfirmed(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-brand)]"
            />
            I&apos;ve saved this recovery code somewhere safe.
          </label>
          {error && <p className="text-sm text-negative">{error}</p>}
          <Button
            type="button"
            onClick={handleConfirmSetup}
            disabled={!recoveryConfirmed || busy}
            className="w-full"
          >
            {busy ? (
              "Finishing…"
            ) : (
              <>
                <Check className="size-4" /> Continue
              </>
            )}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
