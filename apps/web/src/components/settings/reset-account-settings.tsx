"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { resetAccount } from "@/lib/vault/reset-actions";
import { useVaultStore } from "@/lib/vault/store";

const CONFIRM_PHRASE = "RESET";

/**
 * "Reset account" — the Danger Zone card at the bottom of Settings. Built
 * for the one scenario the vault's "not even me" design has no other way
 * back from: a lost passphrase with no recovery code. Reachable
 * regardless of vault lock state (doesn't require unlocking — see
 * vault/reset-actions.ts) since that's exactly the situation it exists
 * to get someone out of.
 */
export function ResetAccountSettings() {
  const lock = useVaultStore((s) => s.lock);
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    setError(null);
    setBusy(true);
    try {
      const result = await resetAccount();
      if (!result.ok) {
        setError(result.error ?? "Couldn't reset your account.");
        setBusy(false);
        return;
      }
      lock();
      // A hard reload, not router.refresh() — every card on this page
      // (and every other page's cached client state) needs to see the
      // account as genuinely fresh, not just re-fetch server props into
      // components that already mounted with the old state.
      window.location.href = "/settings";
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="border-negative text-negative hover:bg-negative/10"
        onClick={() => setOpen(true)}
      >
        Reset account
      </Button>
      <p className="text-xs text-muted-foreground">
        Permanently erases your financial data and vault so you can start
        fresh. Use this only if you&apos;ve lost both your vault passphrase
        and your recovery code — there&apos;s no other way back in.
      </p>

      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Reset your account?"
        description="This cannot be undone."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-negative/40 bg-negative/10 p-3 text-sm text-negative">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1.5">
              <p>This permanently deletes, for this account:</p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>Your vault (passphrase, recovery code, quick-unlock on every device)</li>
                <li>
                  All transactions, budgets, goals, loans, investments,
                  recurring rules, net worth history, and notifications
                </li>
                <li>Any saved AI provider keys and connected agent tokens</li>
              </ul>
              <p>
                Your login, profile, accounts, and categories are kept.
                There&apos;s no undo — but note this only ever deletes data a
                lost passphrase already made permanently unreadable, plus
                your vault credentials themselves; it can&apos;t make
                anything you could still read today become unreadable.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resetConfirm">
              Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm
            </Label>
            <Input
              id="resetConfirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>

          {error && <p className="text-sm text-negative">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={handleReset}
              disabled={busy || confirmText !== CONFIRM_PHRASE}
              className="flex-1"
            >
              {busy ? "Resetting…" : "Reset my account"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
