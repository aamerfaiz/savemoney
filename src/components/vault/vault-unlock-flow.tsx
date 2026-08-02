"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, Lock, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { ResetAccountSettings } from "@/components/settings/reset-account-settings";
import {
  decodeRecoveryCode,
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

type Mode = "setup" | "showRecovery" | "locked" | "recover";

/**
 * The setup/unlock/recover state machine — everything the vault needs
 * *before* a DEK exists in memory. Originally lived only inside
 * `vault-settings.tsx`; extracted (Phase 3.5.6+, ad hoc request) so the
 * exact same flow can render either on the Settings page or inline in a
 * `VaultLockedPrompt` overlay on any other page — a user shouldn't have
 * to navigate to Settings just to type a passphrase. `VaultSettings`
 * keeps everything specific to an *already-unlocked* vault (change
 * passphrase, quick-unlock, rotation) — this component ends the moment a
 * DEK exists.
 */
export function VaultUnlockFlow({
  hasVault,
  isOAuthOnly = false,
  onUnlocked,
}: {
  hasVault: boolean;
  isOAuthOnly?: boolean;
  onUnlocked?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const unlock = useVaultStore((s) => s.unlock);

  const [mode, setMode] = useState<Mode>(hasVault ? "locked" : "setup");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryDisplay, setRecoveryDisplay] = useState<string | null>(null);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState("");
  const [recoverNewPassphrase, setRecoverNewPassphrase] = useState("");
  const [recoverConfirmPassphrase, setRecoverConfirmPassphrase] = useState("");

  // Held only across the setup flow (between generating the keys and the
  // user confirming they saved the recovery code) — never persisted.
  const [pendingSetup, setPendingSetup] = useState<{
    dek: CryptoKey;
    passwordWrap: { ciphertext: string; iv: string };
    passwordSalt: Uint8Array<ArrayBuffer>;
    recoveryWrap: { ciphertext: string; iv: string };
    recoverySalt: Uint8Array<ArrayBuffer>;
  } | null>(null);

  function finishUnlock(dek: CryptoKey) {
    unlock(dek);
    queryClient.invalidateQueries({ queryKey: ["vault-status"] });
    router.refresh();
    onUnlocked?.();
  }

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
      const dek = pendingSetup.dek;
      setPendingSetup(null);
      setRecoveryDisplay(null);
      setPassphrase("");
      setConfirmPassphrase("");
      finishUnlock(dek);
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
      setPassphrase("");
      finishUnlock(unwrapped);
    } catch {
      setError("Incorrect passphrase.");
    } finally {
      setBusy(false);
    }
  }

  /** Recovery-code unlock, for when the passphrase itself is forgotten.
   * Since the user got here by not knowing their passphrase, this single
   * form also sets a new one in the same step rather than unlocking and
   * leaving them stuck with a passphrase they can't use — the old
   * passphrase wrap is simply overwritten via `rotateVaultSecret`. */
  async function handleRecoverUnlock() {
    setError(null);
    if (recoverNewPassphrase.length < 10) {
      setError("Use at least 10 characters for your new passphrase.");
      return;
    }
    if (recoverNewPassphrase !== recoverConfirmPassphrase) {
      setError("Passphrases don't match.");
      return;
    }
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
      const recoveryBytes = decodeRecoveryCode(recoveryCodeInput);
      const recoveryKek = await deriveKekFromHighEntropySecret(
        recoveryBytes,
        fromBase64(blob.recoverySalt),
        "vault-recovery-kek",
      );
      const recoveredDek = await unwrapDek(blob.recoveryWrap, recoveryKek);

      const passwordSalt = randomBytes(16);
      const passwordKek = await deriveKekFromSecret(
        recoverNewPassphrase,
        passwordSalt,
        PASSPHRASE_KDF_PARAMS,
      );
      const passwordWrap = await wrapDek(recoveredDek, passwordKek);
      const result = await rotateVaultSecret({
        path: "password",
        wrap: passwordWrap,
        salt: toBase64(passwordSalt),
        kdfParams: PASSPHRASE_KDF_PARAMS,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save your new passphrase.");
        return;
      }

      setRecoveryCodeInput("");
      setRecoverNewPassphrase("");
      setRecoverConfirmPassphrase("");
      finishUnlock(recoveredDek);
    } catch {
      setError("That recovery code didn't work — double-check it and try again.");
    } finally {
      setBusy(false);
    }
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
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
        />
        {error && <p className="text-sm text-negative">{error}</p>}
        <Button type="button" onClick={handleUnlock} disabled={busy || !passphrase} className="w-full">
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setError(null);
            setMode("recover");
          }}
        >
          Forgot your passphrase? Use your recovery code
        </Button>
      </div>
    );
  }

  if (mode === "recover") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <KeyRound className="size-4" />
          Recover with your code
        </div>
        <p className="text-xs text-muted-foreground">
          Enter the recovery code you saved when you set up your vault.
          You&apos;ll set a new passphrase in the same step.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="recoveryCode">Recovery code</Label>
          <Input
            id="recoveryCode"
            value={recoveryCodeInput}
            onChange={(e) => setRecoveryCodeInput(e.target.value)}
            autoComplete="off"
            className="font-mono"
            placeholder="XXXXX-XXXXX-XXXXX-…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recoverNewPassphrase">New passphrase</Label>
          <Input
            id="recoverNewPassphrase"
            type="password"
            value={recoverNewPassphrase}
            onChange={(e) => setRecoverNewPassphrase(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recoverConfirmPassphrase">Confirm new passphrase</Label>
          <Input
            id="recoverConfirmPassphrase"
            type="password"
            value={recoverConfirmPassphrase}
            onChange={(e) => setRecoverConfirmPassphrase(e.target.value)}
            autoComplete="off"
          />
        </div>
        {error && <p className="text-sm text-negative">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleRecoverUnlock}
            disabled={busy || !recoveryCodeInput || !recoverNewPassphrase}
          >
            {busy ? "Recovering…" : "Recover & set new passphrase"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setError(null);
              setMode("locked");
            }}
          >
            Back
          </Button>
        </div>
        <p className="text-xs text-negative">
          This only works with your recovery code — if you&apos;ve lost both
          your passphrase and this code, your data is permanently unreadable.
        </p>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            Don&apos;t have your recovery code either? You can start fresh
            instead:
          </p>
          <ResetAccountSettings />
        </div>
      </div>
    );
  }

  // mode === "setup" | "showRecovery"
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brand" />
        <p>
          {isOAuthOnly
            ? "You signed in with Google, so you've never set a password for this app — the Vault Passphrase is a separate secret you create now. It encrypts your financial data end-to-end: not even we can read it without it."
            : "Set up your vault to encrypt your financial data end-to-end — not even we can read it. This passphrase is separate from your login password and is never sent anywhere."}
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
          autoFocus
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

      <Button type="button" onClick={handleBeginSetup} disabled={busy} className="w-full">
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
