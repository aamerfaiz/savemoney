"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import {
  decryptField,
  deriveKekFromHighEntropySecret,
  deriveKekFromSecret,
  encryptField,
  fromBase64,
  generateDek,
  generateRecoveryCode,
  PASSPHRASE_KDF_PARAMS,
  randomBytes,
  toBase64,
  unwrapDek,
  wrapDek,
} from "@/lib/vault/crypto";
import { getVaultBlob } from "@/lib/vault/actions";
import { fetchRotationRawData, applyVaultRotation, type RotationInput } from "@/lib/vault/rotation-actions";
import { reencryptForRotation } from "@/lib/vault/reencrypt";
import { useCurrentUserId } from "@/lib/vault/use-current-user-id";
import { clearPinWrap } from "@/lib/vault/local-store";

type Step = "idle" | "confirm" | "passphrase" | "recovery";

/**
 * "Rotate vault" (Phase 3.5.6) — the remedy for a lost/stolen device that
 * had quick-unlock enabled (see the plan doc's "Device revocation"
 * decision). A device's cached PIN-wrapped copy of the DEK can't be
 * remotely deleted, so the only real fix is generating a brand new DEK,
 * re-encrypting every row under it, and re-wrapping for the password and
 * a fresh recovery code. The existing passphrase is kept (re-entered here
 * only to prove the caller holds it and to re-derive its KEK for the new
 * wrap — it was never cached, by design); a brand new recovery code is
 * always issued rather than requiring the old one back, since "was the
 * old code also exposed?" is usually unknowable in exactly the scenario
 * that triggers a rotation. Every other trusted device (anything that
 * only had quick-unlock, or an MCP agent token) can't be carried forward
 * server-side — the PIN/token secret that would let us re-derive their
 * wrap was never something this server had. They fall back to the
 * passphrase or the new recovery code, same as a brand new device would.
 */
export function RotateVaultSettings({
  dek,
  onRotated,
}: {
  dek: CryptoKey;
  onRotated: (newDek: CryptoKey) => void;
}) {
  const queryClient = useQueryClient();
  const userIdQuery = useCurrentUserId();
  const [step, setStep] = useState<Step>("idle");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [recoveryDisplay, setRecoveryDisplay] = useState<string | null>(null);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);

  // Held only across the rotation flow, never persisted.
  const [pending, setPending] = useState<{
    newDek: CryptoKey;
    payload: Omit<
      RotationInput,
      "passwordWrap" | "passwordSalt" | "passwordKdfParams" | "recoveryWrap" | "recoverySalt"
    >;
    passwordWrap: { ciphertext: string; iv: string };
    passwordSalt: Uint8Array<ArrayBuffer>;
    recoveryWrap: { ciphertext: string; iv: string };
    recoverySalt: Uint8Array<ArrayBuffer>;
  } | null>(null);

  function reset() {
    setStep("idle");
    setPassphrase("");
    setError(null);
    setBusy(false);
    setBusyMessage(null);
    setRecoveryDisplay(null);
    setRecoveryConfirmed(false);
    setPending(null);
  }

  async function handleSubmitPassphrase() {
    setError(null);
    if (!passphrase) return;
    setBusy(true);
    setBusyMessage("Verifying your passphrase…");
    try {
      const blob = await getVaultBlob();
      if ("error" in blob || !blob.hasVault) {
        setError(blob && "error" in blob ? blob.error ?? "Something went wrong." : "No vault found.");
        return;
      }
      const kek = await deriveKekFromSecret(
        passphrase,
        fromBase64(blob.passwordSalt),
        blob.passwordKdfParams as import("@/lib/vault/crypto").Argon2Params,
      );
      const candidateDek = await unwrapDek(blob.passwordWrap, kek);
      // Round-trip probe: confirms `candidateDek` really is the same DEK
      // already unlocked in memory, without ever exporting raw key bytes
      // from either (non-extractable-safe equality check).
      const probe = "vault-rotation-probe";
      const enc = await encryptField(probe, dek);
      const dec = await decryptField(enc, candidateDek);
      if (dec !== probe) {
        setError("Incorrect passphrase.");
        return;
      }

      setBusyMessage("Fetching your data…");
      const raw = await fetchRotationRawData();
      if ("error" in raw) {
        setError(raw.error);
        return;
      }

      setBusyMessage("Re-encrypting your data — this may take a moment…");
      const newDek = await generateDek();
      const reencrypted = await reencryptForRotation(raw, dek, newDek);

      const passwordSalt = randomBytes(16);
      const newPasswordKek = await deriveKekFromSecret(passphrase, passwordSalt, PASSPHRASE_KDF_PARAMS);
      const passwordWrap = await wrapDek(newDek, newPasswordKek);

      const recovery = generateRecoveryCode();
      const recoverySalt = randomBytes(16);
      const recoveryKek = await deriveKekFromHighEntropySecret(
        recovery.bytes,
        recoverySalt,
        "vault-recovery-kek",
      );
      const recoveryWrap = await wrapDek(newDek, recoveryKek);

      setPending({ newDek, payload: reencrypted, passwordWrap, passwordSalt, recoveryWrap, recoverySalt });
      setRecoveryDisplay(recovery.display);
      setPassphrase("");
      setStep("recovery");
    } catch {
      setError("Something went wrong verifying your passphrase. Try again.");
    } finally {
      setBusy(false);
      setBusyMessage(null);
    }
  }

  async function handleFinishRotation() {
    if (!pending || !recoveryConfirmed) return;
    setError(null);
    setBusy(true);
    setBusyMessage("Saving your rotated vault…");
    try {
      const result = await applyVaultRotation({
        ...pending.payload,
        passwordWrap: pending.passwordWrap,
        passwordSalt: toBase64(pending.passwordSalt),
        passwordKdfParams: PASSPHRASE_KDF_PARAMS,
        recoveryWrap: pending.recoveryWrap,
        recoverySalt: toBase64(pending.recoverySalt),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the rotated vault.");
        return;
      }

      const userId = userIdQuery.data;
      if (userId) await clearPinWrap(userId);
      queryClient.invalidateQueries({ queryKey: ["vault-status"] });
      onRotated(pending.newDek);
      reset();
    } catch {
      setError("Something went wrong saving the rotated vault.");
    } finally {
      setBusy(false);
      setBusyMessage(null);
    }
  }

  if (step === "idle") {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setStep("confirm")}>
        <RefreshCw className="size-4" />
        Rotate vault (lost a device?)
      </Button>
    );
  }

  return (
    <Dialog
      open
      onClose={() => !busy && reset()}
      title={step === "recovery" ? "Save your new recovery code" : "Rotate your vault"}
      description={
        step === "confirm"
          ? "Use this if a device with quick-unlock enabled was lost or stolen."
          : step === "passphrase"
            ? "Re-enter your passphrase to continue."
            : "This is the only way back in if you forget your passphrase. It's shown once — write it down now."
      }
    >
      <div className="space-y-4">
        {step === "confirm" && (
          <>
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="space-y-1.5">
                <p>
                  This generates a brand new vault key and re-encrypts every
                  row of your financial data under it. Your passphrase keeps
                  working; you&apos;ll get a new recovery code.
                </p>
                <p>
                  Any other device that only had quick-unlock enabled — and
                  any connected AI agent token — will stop working and need
                  to unlock again with your passphrase or the new recovery
                  code.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={() => setStep("passphrase")}>
                Continue
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {step === "passphrase" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="rotatePassphrase">Current passphrase</Label>
              <Input
                id="rotatePassphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="off"
                onKeyDown={(e) => e.key === "Enter" && passphrase && handleSubmitPassphrase()}
              />
            </div>
            {busyMessage && <p className="text-xs text-muted-foreground">{busyMessage}</p>}
            {error && <p className="text-sm text-negative">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" onClick={handleSubmitPassphrase} disabled={busy || !passphrase}>
                {busy ? "Working…" : "Continue"}
              </Button>
              <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
                Cancel
              </Button>
            </div>
          </>
        )}

        {step === "recovery" && (
          <>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-4 font-mono text-sm tracking-wide">
              <span className="break-all">{recoveryDisplay}</span>
            </div>
            <p className="text-xs text-negative">
              Your old recovery code no longer works. If you lose both your
              passphrase and this new code, your data is permanently
              unreadable.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={recoveryConfirmed}
                onChange={(e) => setRecoveryConfirmed(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-brand)]"
              />
              I&apos;ve saved this new recovery code somewhere safe.
            </label>
            {busyMessage && <p className="text-xs text-muted-foreground">{busyMessage}</p>}
            {error && <p className="text-sm text-negative">{error}</p>}
            <Button
              type="button"
              onClick={handleFinishRotation}
              disabled={!recoveryConfirmed || busy}
              className="w-full"
            >
              {busy ? "Finishing…" : (
                <>
                  <Check className="size-4" /> Finish rotation
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
