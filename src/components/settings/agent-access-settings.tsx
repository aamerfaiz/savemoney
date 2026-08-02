"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Copy, ShieldAlert, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  deriveKekFromHighEntropySecret,
  generateMcpToken,
  hashToken,
  randomBytes,
  toBase64,
  wrapDek,
} from "@/lib/vault/crypto";
import { mintMcpToken, revokeMcpToken } from "@/lib/vault/actions";
import { MCP_TOKEN_DURATION_PRESETS_DAYS } from "@/lib/vault/constants";
import { useVaultStore } from "@/lib/vault/store";
import type { McpTokenMeta } from "@/lib/vault/queries";

const SCOPE_LABELS: Record<McpTokenMeta["scope"], string> = {
  read_summary: "Read summary (dates, categories, computed totals — no raw amounts)",
  read_full: "Read full (real amounts, descriptions, notes)",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AgentAccessSettings({ tokens }: { tokens: McpTokenMeta[] }) {
  const router = useRouter();
  const dek = useVaultStore((s) => s.dek);

  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<McpTokenMeta["scope"]>("read_summary");
  const [canWrite, setCanWrite] = useState(false);
  const [durationDays, setDurationDays] = useState<number>(
    MCP_TOKEN_DURATION_PRESETS_DAYS[1],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);

  async function handleMint() {
    if (!dek) {
      setError("Unlock your vault above before connecting an agent.");
      return;
    }
    if (!label.trim()) {
      setError("Give this token a name, e.g. \"Claude Desktop\".");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = generateMcpToken();
      const salt = randomBytes(16);
      const tokenKek = await deriveKekFromHighEntropySecret(
        token.bytes,
        salt,
        "mcp-token-kek",
      );
      const wrap = await wrapDek(dek, tokenKek);
      const tokenHash = await hashToken(token.bytes);

      const result = await mintMcpToken({
        label: label.trim(),
        scope,
        canWrite,
        durationDays,
        tokenHash,
        wrap,
        salt: toBase64(salt),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't create the token.");
        return;
      }
      setMintedToken(token.display);
      setLabel("");
      setCanWrite(false);
      router.refresh();
    } catch {
      setError("Something went wrong creating the token.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string, tokenLabel: string) {
    if (!confirm(`Revoke "${tokenLabel}"? Any agent using it loses access immediately.`)) return;
    await revokeMcpToken(id);
    router.refresh();
  }

  async function handleCopy() {
    if (!mintedToken) return;
    await navigator.clipboard.writeText(mintedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function mcpConfigJson(): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return JSON.stringify(
      {
        mcpServers: {
          "finance-os": {
            url: `${origin}/api/mcp`,
            headers: { Authorization: `Bearer ${mintedToken}` },
          },
        },
      },
      null,
      2,
    );
  }

  async function handleCopyConfig() {
    await navigator.clipboard.writeText(mcpConfigJson());
    setConfigCopied(true);
    setTimeout(() => setConfigCopied(false), 2000);
  }

  const active = tokens.filter((t) => !t.revokedAt && new Date(t.expiresAt) > new Date());
  const inactive = tokens.filter((t) => t.revokedAt || new Date(t.expiresAt) <= new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Bot className="mt-0.5 size-4 shrink-0 text-brand" />
        <p>
          Connect an agent (Claude, Claude Desktop, Cursor, or another MCP
          client) with a token scoped to what it can see, and an expiry it
          can never outlive. Unlike your login, a leaked token is a leaked
          key to your data until you revoke it — treat it that way.
        </p>
      </div>

      {!dek && (
        <p className="flex items-center gap-1.5 text-sm text-warning">
          <ShieldAlert className="size-4 shrink-0" />
          Unlock your vault above to mint or manage agent tokens.
        </p>
      )}

      {active.length > 0 && (
        <ul className="space-y-2">
          {active.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{t.label}</span>
                  <Badge variant={t.scope === "read_full" ? "brand" : "default"}>
                    {t.scope === "read_full" ? "Full" : "Summary"}
                  </Badge>
                  {t.canWrite && <Badge variant="brand">Write</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  Expires {formatDate(t.expiresAt)}
                  {t.lastUsedAt ? ` · last used ${formatDate(t.lastUsedAt)}` : " · never used"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Revoke ${t.label}`}
                onClick={() => handleRevoke(t.id, t.label)}
              >
                <Trash2 className="size-4 text-negative" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {inactive.length > 0 && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none">
            {inactive.length} revoked or expired
          </summary>
          <ul className="mt-2 space-y-1.5">
            {inactive.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-1 text-xs">
                <span className="truncate">{t.label}</span>
                <span>{t.revokedAt ? "Revoked" : "Expired"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <div className="space-y-1.5">
          <Label htmlFor="mcpLabel">Name</Label>
          <Input
            id="mcpLabel"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Claude Desktop"
            disabled={!dek}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="mcpScope">Access</Label>
            <Select
              id="mcpScope"
              value={scope}
              onChange={(e) => {
                const next = e.target.value as McpTokenMeta["scope"];
                setScope(next);
                if (next !== "read_full") setCanWrite(false);
              }}
              disabled={!dek}
            >
              <option value="read_summary">Summary only</option>
              <option value="read_full">Full data</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcpDuration">Expires in</Label>
            <Select
              id="mcpDuration"
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              disabled={!dek}
            >
              {MCP_TOKEN_DURATION_PRESETS_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{SCOPE_LABELS[scope]}</p>

        <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <span className="text-sm">
            <span className="font-medium">Allow write access</span>
            <span className="block text-xs text-muted-foreground">
              The agent can create, edit, and delete data — every edit or delete still needs your
              agent to ask for confirmation first. Requires &quot;Full data&quot; access.
            </span>
          </span>
          <input
            type="checkbox"
            checked={canWrite}
            onChange={(e) => setCanWrite(e.target.checked)}
            disabled={!dek || scope !== "read_full"}
            className="size-4 shrink-0 accent-[var(--color-brand)]"
          />
        </label>

        {error && <p className="text-sm text-negative">{error}</p>}

        <Button type="button" onClick={handleMint} disabled={!dek || busy}>
          {busy ? "Creating…" : "Create token"}
        </Button>
      </div>

      <Dialog
        open={mintedToken !== null}
        onClose={() => setMintedToken(null)}
        title="Copy this token now"
        description="Shown once. Paste it into your agent's MCP configuration — it won't be shown again."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-4 font-mono text-sm break-all">
            {mintedToken}
          </div>
          <Button type="button" variant="outline" onClick={handleCopy} className="w-full">
            {copied ? (
              <>
                <Check className="size-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="size-4" /> Copy token
              </>
            )}
          </Button>

          <div className="space-y-1.5 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">
              Connect it (e.g. Claude Desktop / Claude Code / Cursor MCP config)
            </p>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-all">
              {mcpConfigJson()}
            </pre>
            <Button type="button" variant="outline" onClick={handleCopyConfig} className="w-full">
              {configCopied ? (
                <>
                  <Check className="size-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="size-4" /> Copy config
                </>
              )}
            </Button>
          </div>

          <Button type="button" onClick={() => setMintedToken(null)} className="w-full">
            Done
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
